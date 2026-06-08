import { basename } from "node:path";

import type { ToolDefinition, ToolExecutionContext } from "../../../core/dist/types.js";
import { resolveAssetCandidates } from "../assetResolver.js";
import { submitFalGeneration, smartTopologyModel } from "../adapters/fal3d.js";
import { provenanceFromCandidate } from "../provenance.js";
import { buildSourcePlan, classifyAssetIntent, selectFalModel } from "../sourcePolicy.js";
import type { AssetCandidate } from "../types.js";

const intentSchema = {
  type: "string",
  enum: [
    "specific_object",
    "generic_furniture",
    "generic_prop",
    "environment_hdri",
    "texture",
    "material",
    "character",
    "vehicle",
    "generated_concept"
  ]
};

const policySchema = { type: "string", enum: ["fallback_only", "candidate", "force"] };

export const assetTools: ToolDefinition[] = [
  {
    name: "asset.resolve_source_plan",
    description: "Classify asset intent and write a source priority plan across local cache, Poly Haven, Sketchfab/Fab, and fal fallback generation.",
    category: "asset",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", minLength: 1, maxLength: 2000 },
        intent: intentSchema,
        style: { type: "string", maxLength: 200 },
        policy: policySchema,
        userSuppliedPath: { type: "string" },
        userSuppliedUrl: { type: "string" }
      },
      required: ["prompt"],
      additionalProperties: false
    },
    async execute(context, input) {
      const prompt = stringInput(input.prompt, "prompt");
      const plan = buildSourcePlan({
        prompt,
        intent: input.intent,
        style: input.style,
        policy: input.policy,
        userSupplied: typeof input.userSuppliedPath === "string" || typeof input.userSuppliedUrl === "string"
      });
      const artifact = await context.artifactStore.writeJson("assets/sourcing_plan.json", plan);
      return {
        ok: true,
        message: `Asset source plan written for ${plan.intent}`,
        artifacts: [artifact],
        data: { plan }
      };
    }
  },
  {
    name: "asset.search_candidates",
    description: "Write scored asset candidates using the source policy. Remote providers are represented as provenance-safe candidates unless explicit acquisition is enabled.",
    category: "asset",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", minLength: 1, maxLength: 2000 },
        intent: intentSchema,
        style: { type: "string", maxLength: 200 },
        policy: policySchema,
        userSuppliedPath: { type: "string" },
        userSuppliedUrl: { type: "string" },
        maxCandidates: { type: "number", minimum: 1, maximum: 20 }
      },
      required: ["prompt"],
      additionalProperties: false
    },
    async execute(context, input) {
      const resolved = await resolveInput(context, input);
      const planArtifact = await context.artifactStore.writeJson("assets/sourcing_plan.json", resolved.plan);
      const candidatesArtifact = await context.artifactStore.writeJson("assets/candidates.json", {
        schema: "creative.pipeline.asset_candidates.v1",
        candidates: resolved.candidates
      });
      return {
        ok: true,
        message: `Asset candidates written: ${resolved.candidates.length}`,
        artifacts: [planArtifact, candidatesArtifact],
        data: resolved
      };
    }
  },
  {
    name: "asset.acquire_asset",
    description: "Acquire a selected local/user asset into artifact storage or write a remote acquisition manifest with provenance and license records.",
    category: "asset",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        candidate: { type: "object" },
        sourcePath: { type: "string" },
        sourceUrl: { type: "string" },
        title: { type: "string", maxLength: 300 },
        provider: { type: "string" },
        license: { type: "string", maxLength: 100 }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const candidate = normalizeCandidate(input);
      const artifacts: string[] = [];
      if (candidate.localPath) {
        await context.artifactStore.assertReadableFile(candidate.localPath);
        const copied = await context.artifactStore.copyIn(candidate.localPath, `assets/original/${basename(candidate.localPath)}`);
        artifacts.push(copied);
      } else if (candidate.downloadUrl && process.env.CREATIVE_MCP_ENABLE_ASSET_DOWNLOAD === "true") {
        const response = await fetch(candidate.downloadUrl);
        if (!response.ok) throw new Error(`Asset download failed: ${response.status} ${response.statusText}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const copied = await context.artifactStore.writeBytes(`assets/original/${safeName(candidate.title)}.${extensionFor(candidate)}`, bytes);
        artifacts.push(copied);
      }
      const selectedArtifact = await context.artifactStore.writeJson("assets/selected_asset.json", candidate);
      const provenance = provenanceFromCandidate(candidate);
      const provenanceArtifact = await context.artifactStore.writeJson("assets/provenance.json", provenance);
      const licenseArtifact = await context.artifactStore.writeJson("assets/license_manifest.json", {
        schema: "creative.pipeline.asset_license_manifest.v1",
        entries: [{
          title: candidate.title,
          provider: candidate.provider,
          license: candidate.license,
          url: candidate.url,
          generated: Boolean(candidate.generated)
        }]
      });
      artifacts.push(selectedArtifact, provenanceArtifact, licenseArtifact);
      return {
        ok: true,
        message: artifacts.some((artifact) => artifact.includes("/original/"))
          ? "Asset acquired and provenance written"
          : "Remote acquisition manifest and provenance written; asset bytes were not downloaded",
        artifacts,
        data: { candidate, provenance, downloadEnabled: process.env.CREATIVE_MCP_ENABLE_ASSET_DOWNLOAD === "true" }
      };
    }
  },
  {
    name: "asset.generate_3d",
    description: "Write or submit a fal 3D generation request with server-side FAL_KEY guardrails.",
    category: "asset",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", minLength: 1, maxLength: 2000 },
        intent: intentSchema,
        imageUrls: { type: "array", items: { type: "string" }, maxItems: 8 },
        model: { type: "string", maxLength: 120 },
        enablePbr: { type: "boolean" },
        faceCount: { type: "number", minimum: 1000, maximum: 300000 },
        webhookUrl: { type: "string" }
      },
      required: ["prompt"],
      additionalProperties: false
    },
    async execute(context, input) {
      const prompt = stringInput(input.prompt, "prompt");
      const imageUrls = stringArray(input.imageUrls);
      const intent = classifyAssetIntent(prompt, input.intent);
      const model = typeof input.model === "string" ? input.model : selectFalModel(intent, imageUrls.length > 0);
      const request = {
        schema: "creative.pipeline.fal_3d_request.v1",
        model,
        prompt,
        imageUrls,
        enablePbr: input.enablePbr !== false,
        faceCount: typeof input.faceCount === "number" ? input.faceCount : undefined,
        webhookUrl: typeof input.webhookUrl === "string" ? input.webhookUrl : undefined,
        guardrails: {
          enabled: process.env.CREATIVE_MCP_ENABLE_FAL_3D === "true",
          hasServerSideFalKey: Boolean(process.env.FAL_KEY),
          defaultPolicy: process.env.CREATIVE_MCP_FAL_DEFAULT_POLICY ?? "fallback_only"
        }
      };
      const requestArtifact = await context.artifactStore.writeJson("assets/generated/fal_request.json", request);
      const submission = await submitFalGeneration(request);
      const resultArtifact = await context.artifactStore.writeJson("assets/generated/fal_result.json", {
        schema: "creative.pipeline.fal_3d_result.v1",
        submitted: submission.submitted,
        reason: submission.reason,
        response: submission.response ?? null
      });
      return {
        ok: true,
        message: submission.submitted ? "fal 3D generation submitted" : "fal 3D generation request written but not submitted",
        artifacts: [requestArtifact, resultArtifact],
        data: { request, submission }
      };
    }
  },
  {
    name: "asset.postprocess_generated_asset",
    description: "Write generated-asset postprocess plan for smart topology, glTF optimization, and final Blender QC.",
    category: "asset",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        sourcePath: { type: "string" },
        sourceUrl: { type: "string" },
        smartTopology: { type: "boolean" },
        optimize: { type: "boolean" },
        targetFormat: { type: "string", enum: ["glb", "gltf", "fbx", "obj"] }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const plan = {
        schema: "creative.pipeline.asset_postprocess_plan.v1",
        sourcePath: typeof input.sourcePath === "string" ? input.sourcePath : undefined,
        sourceUrl: typeof input.sourceUrl === "string" ? input.sourceUrl : undefined,
        steps: [
          input.smartTopology === false ? null : { name: "smart_topology", adapter: smartTopologyModel() },
          input.optimize === false ? null : { name: "gltf_optimize", adapter: "blender.optimize_asset or gltf-transform" },
          { name: "final_qc", adapter: "blender.validate_asset", required: true }
        ].filter(Boolean),
        outputLayout: {
          generated: "artifacts/assets/generated/",
          optimized: "artifacts/assets/optimized/model_optimized.glb",
          qc: "artifacts/assets/qc/asset_qc_report.json"
        },
        targetFormat: typeof input.targetFormat === "string" ? input.targetFormat : "glb"
      };
      const artifact = await context.artifactStore.writeJson("assets/generated/postprocess_plan.json", plan);
      return { ok: true, message: "Generated asset postprocess plan written", artifacts: [artifact], data: { plan } };
    }
  },
  {
    name: "asset.finalize_asset",
    description: "Write final asset package manifest and require final Blender QC evidence before delivery.",
    category: "asset",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        assetPath: { type: "string" },
        provenancePath: { type: "string" },
        qcReportPath: { type: "string" },
        deliveryProfile: { type: "string", maxLength: 120 }
      },
      required: ["assetPath"],
      additionalProperties: false
    },
    async execute(context, input) {
      const assetPath = stringInput(input.assetPath, "assetPath");
      await context.artifactStore.assertReadableFile(assetPath);
      const manifest = {
        schema: "creative.pipeline.final_asset_package.v1",
        assetPath,
        provenancePath: typeof input.provenancePath === "string" ? input.provenancePath : "artifacts/assets/provenance.json",
        qcReportPath: typeof input.qcReportPath === "string" ? input.qcReportPath : "artifacts/assets/qc/asset_qc_report.json",
        deliveryProfile: typeof input.deliveryProfile === "string" ? input.deliveryProfile : "game_ready_glb",
        requiredFinalQc: "Run blender.validate_asset against assetPath before delivery.",
        finalizedAt: new Date().toISOString()
      };
      const artifact = await context.artifactStore.writeJson("assets/final_asset_package.json", manifest);
      return { ok: true, message: "Final asset package manifest written; final QC evidence required", artifacts: [artifact], data: { manifest } };
    }
  },
  {
    name: "asset.write_provenance",
    description: "Write a standalone provenance and license manifest for an acquired or generated asset.",
    category: "asset",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string" },
        sourceId: { type: "string" },
        title: { type: "string", maxLength: 300 },
        license: { type: "string", maxLength: 100 },
        sourceUrl: { type: "string" },
        downloadUrl: { type: "string" },
        generated: { type: "boolean" },
        notes: { type: "array", items: { type: "string" }, maxItems: 20 }
      },
      required: ["provider", "sourceId", "title", "license"],
      additionalProperties: false
    },
    async execute(context, input) {
      const provenance = {
        schema: "creative.pipeline.asset_provenance.v1",
        sourceProvider: stringInput(input.provider, "provider"),
        sourceId: stringInput(input.sourceId, "sourceId"),
        title: stringInput(input.title, "title"),
        license: stringInput(input.license, "license"),
        sourceUrl: typeof input.sourceUrl === "string" ? input.sourceUrl : undefined,
        downloadUrl: typeof input.downloadUrl === "string" ? input.downloadUrl : undefined,
        generated: input.generated === true,
        acquiredAt: new Date().toISOString(),
        notes: stringArray(input.notes)
      };
      const provenanceArtifact = await context.artifactStore.writeJson("assets/provenance.json", provenance);
      const licenseArtifact = await context.artifactStore.writeJson("assets/license_manifest.json", {
        schema: "creative.pipeline.asset_license_manifest.v1",
        entries: [provenance]
      });
      return { ok: true, message: "Asset provenance written", artifacts: [provenanceArtifact, licenseArtifact], data: { provenance } };
    }
  },
  {
    name: "asset.acquire_or_generate",
    description: "Macro tool that resolves candidates and selects an existing asset when possible, otherwise writes a fal fallback request under the selected policy.",
    category: "asset",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", minLength: 1, maxLength: 2000 },
        intent: intentSchema,
        style: { type: "string", maxLength: 200 },
        policy: policySchema,
        userSuppliedPath: { type: "string" },
        userSuppliedUrl: { type: "string" },
        maxCandidates: { type: "number", minimum: 1, maximum: 20 }
      },
      required: ["prompt"],
      additionalProperties: false
    },
    async execute(context, input) {
      const resolved = await resolveInput(context, input);
      const artifacts = [
        await context.artifactStore.writeJson("assets/sourcing_plan.json", resolved.plan),
        await context.artifactStore.writeJson("assets/candidates.json", { schema: "creative.pipeline.asset_candidates.v1", candidates: resolved.candidates })
      ];
      const selected = resolved.plan.policy === "force"
        ? resolved.candidates.find((candidate) => candidate.generated) ?? resolved.candidates[0]
        : resolved.candidates.find((candidate) => !candidate.generated) ?? resolved.candidates[0];
      if (!selected) {
        return { ok: false, message: "No asset candidate could be resolved", artifacts, data: resolved };
      }
      artifacts.push(await context.artifactStore.writeJson("assets/selected_asset.json", selected));
      artifacts.push(await context.artifactStore.writeJson("assets/provenance.json", provenanceFromCandidate(selected)));
      if (selected.generated) {
        const generation = await submitFalGeneration({
          model: selectFalModel(resolved.plan.intent, false),
          prompt: resolved.plan.prompt
        });
        artifacts.push(await context.artifactStore.writeJson("assets/generated/fal_request.json", {
          schema: "creative.pipeline.fal_3d_request.v1",
          prompt: resolved.plan.prompt,
          model: selectFalModel(resolved.plan.intent, false),
          policy: resolved.plan.policy
        }));
        artifacts.push(await context.artifactStore.writeJson("assets/generated/fal_result.json", generation));
      }
      return {
        ok: true,
        message: selected.generated ? "Generated asset fallback planned" : "Existing asset candidate selected",
        artifacts,
        data: { ...resolved, selected }
      };
    }
  }
];

async function resolveInput(context: ToolExecutionContext, input: Record<string, unknown>) {
  return resolveAssetCandidates({
    prompt: stringInput(input.prompt, "prompt"),
    intent: input.intent,
    style: input.style,
    policy: input.policy ?? process.env.CREATIVE_MCP_FAL_DEFAULT_POLICY ?? "fallback_only",
    userSuppliedPath: input.userSuppliedPath,
    userSuppliedUrl: input.userSuppliedUrl,
    workspaceRoots: context.artifactStore.workspaceRoots ?? [process.cwd()],
    maxCandidates: typeof input.maxCandidates === "number" ? input.maxCandidates : Number(process.env.CREATIVE_MCP_FAL_MAX_CANDIDATES ?? 5)
  });
}

function normalizeCandidate(input: Record<string, unknown>): AssetCandidate {
  if (input.candidate && typeof input.candidate === "object") {
    return input.candidate as AssetCandidate;
  }
  const sourcePath = typeof input.sourcePath === "string" ? input.sourcePath : undefined;
  const sourceUrl = typeof input.sourceUrl === "string" ? input.sourceUrl : undefined;
  const title = typeof input.title === "string" ? input.title : sourcePath ? basename(sourcePath) : sourceUrl ?? "asset";
  const provider = typeof input.provider === "string" ? input.provider : sourcePath ? "user_supplied" : "sketchfab";
  const license = typeof input.license === "string" ? input.license : "Unknown";
  return {
    id: `${provider}:${sourcePath ?? sourceUrl ?? title}`,
    provider: provider as AssetCandidate["provider"],
    intent: "specific_object",
    title,
    format: extensionFor({ title, localPath: sourcePath, url: sourceUrl } as AssetCandidate) as AssetCandidate["format"],
    license,
    localPath: sourcePath,
    url: sourceUrl,
    downloadUrl: sourceUrl,
    score: {
      semanticMatch: 0.5,
      sourcePriority: 0.5,
      licenseSafety: 0.3,
      formatScore: 0.5,
      qcScore: 0.5,
      textureScore: 0.5,
      styleScore: 0.5,
      costScore: 0.5,
      finalScore: 0.5
    }
  };
}

function stringInput(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function safeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "asset";
}

function extensionFor(candidate: AssetCandidate): string {
  const source = candidate.localPath ?? candidate.downloadUrl ?? candidate.url ?? candidate.title;
  const match = source.toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  if (match?.[1]) return match[1];
  return candidate.format === "unknown" || candidate.format === "material" ? "json" : candidate.format;
}
