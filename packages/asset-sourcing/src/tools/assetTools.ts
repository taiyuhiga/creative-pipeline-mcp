import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

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
    description: "Classify asset intent and write a source priority plan across local cache, Poly Haven, Sketchfab, manual Fab URLs, and fal fallback generation.",
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
        const { bytes, resolvedUrl } = await downloadCandidateBytes(candidate);
        candidate.metadata = { ...(candidate.metadata ?? {}), resolvedDownloadUrl: resolvedUrl };
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
    name: "asset.ingest_generated_result",
    description: "Extract generated model, preview, and texture URLs from a fal-style result and optionally download generated outputs into artifact storage.",
    category: "asset",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        falResult: { type: "object" },
        falResultPath: { type: "string" },
        download: { type: "boolean" },
        title: { type: "string", maxLength: 300 },
        license: { type: "string", maxLength: 100 }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const result = await loadGeneratedResult(context, input);
      const outputs = extractGeneratedOutputs(result);
      const shouldDownload = input.download === true && process.env.CREATIVE_MCP_ENABLE_ASSET_DOWNLOAD === "true";
      const downloaded: Array<{ role: string; url: string; artifact: string }> = [];
      const artifacts: string[] = [];
      if (shouldDownload) {
        for (const output of outputs) {
          const bytes = await downloadUrlBytes(output.url);
          const artifact = await context.artifactStore.writeBytes(`assets/generated/${output.fileName}`, bytes);
          downloaded.push({ role: output.role, url: output.url, artifact });
          artifacts.push(artifact);
        }
      }
      const manifest = {
        schema: "creative.pipeline.generated_asset_outputs.v1",
        title: typeof input.title === "string" ? input.title : "generated asset",
        license: typeof input.license === "string" ? input.license : "Generated",
        outputs,
        downloaded,
        downloadEnabled: process.env.CREATIVE_MCP_ENABLE_ASSET_DOWNLOAD === "true",
        downloadRequested: input.download === true,
        postprocess: {
          nextTool: "asset.postprocess_generated_asset",
          requiredFinalQc: "Run blender.validate_asset against the downloaded or postprocessed model before delivery."
        }
      };
      const outputsArtifact = await context.artifactStore.writeJson("assets/generated/fal_outputs.json", manifest);
      const provenanceArtifact = await context.artifactStore.writeJson("assets/provenance.json", {
        schema: "creative.pipeline.asset_provenance.v1",
        sourceProvider: "fal_hunyuan",
        sourceId: "fal_result",
        title: manifest.title,
        license: manifest.license,
        sourceUrl: outputs.find((output) => output.role === "model")?.url ?? outputs[0]?.url,
        downloadUrl: downloaded.find((output) => output.role === "model")?.artifact,
        generated: true,
        acquiredAt: new Date().toISOString(),
        notes: [
          "Generated outputs were extracted from a fal-style result.",
          "Run postprocess and final Blender QC before delivery."
        ]
      });
      const licenseArtifact = await context.artifactStore.writeJson("assets/license_manifest.json", {
        schema: "creative.pipeline.asset_license_manifest.v1",
        entries: [{
          title: manifest.title,
          provider: "fal",
          license: manifest.license,
          generated: true,
          urls: outputs.map((output) => output.url)
        }]
      });
      artifacts.push(outputsArtifact, provenanceArtifact, licenseArtifact);
      return {
        ok: true,
        message: shouldDownload ? `Generated outputs ingested and downloaded: ${downloaded.length}` : `Generated outputs ingested: ${outputs.length}`,
        artifacts,
        data: { manifest }
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
    name: "asset.evaluate_license_policy",
    description: "Normalize asset license metadata and write commercial-use, attribution, review, and postprocess requirements.",
    category: "asset",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 300 },
        provider: { type: "string" },
        license: { type: "string", maxLength: 100 },
        sourceUrl: { type: "string" },
        generated: { type: "boolean" }
      },
      required: ["title", "provider", "license"],
      additionalProperties: false
    },
    async execute(context, input) {
      const policy = evaluateLicense({
        title: stringInput(input.title, "title"),
        provider: stringInput(input.provider, "provider"),
        license: stringInput(input.license, "license"),
        sourceUrl: typeof input.sourceUrl === "string" ? input.sourceUrl : undefined,
        generated: input.generated === true
      });
      const artifact = await context.artifactStore.writeJson("assets/license_policy_report.json", policy);
      return { ok: policy.status !== "blocked", message: `Asset license policy written: ${policy.status}`, artifacts: [artifact], data: { policy } };
    }
  },
  {
    name: "asset.write_asset_sbom",
    description: "Write an asset package SBOM with checksums, license policy, provenance paths, and final QC requirements.",
    category: "asset",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        packageName: { type: "string", maxLength: 200 },
        entries: { type: "array" },
        provenancePath: { type: "string" },
        licenseManifestPath: { type: "string" },
        qcReportPath: { type: "string" }
      },
      required: ["packageName"],
      additionalProperties: false
    },
    async execute(context, input) {
      const entries = await normalizeSbomEntries(context, input.entries);
      const sbom = {
        schema: "creative.pipeline.asset_package_sbom.v1",
        generatedAt: new Date().toISOString(),
        packageName: stringInput(input.packageName, "packageName"),
        entries,
        provenancePath: typeof input.provenancePath === "string" ? input.provenancePath : "artifacts/assets/provenance.json",
        licenseManifestPath: typeof input.licenseManifestPath === "string" ? input.licenseManifestPath : "artifacts/assets/license_manifest.json",
        qcReportPath: typeof input.qcReportPath === "string" ? input.qcReportPath : "artifacts/assets/qc/asset_qc_report.json",
        requirements: {
          finalBlenderQcRequired: true,
          attributionReportRequired: entries.some((entry) => entry.licensePolicy.attributionRequired),
          manualReviewRequired: entries.some((entry) => entry.licensePolicy.manualReviewRequired),
          postprocessQcRequired: entries.some((entry) => entry.postprocessQcRequired)
        }
      };
      const artifact = await context.artifactStore.writeJson("assets/asset_package_sbom.json", sbom);
      return { ok: true, message: "Asset package SBOM written", artifacts: [artifact], data: { sbom } };
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

function evaluateLicense(input: {
  title: string;
  provider: string;
  license: string;
  sourceUrl?: string;
  generated: boolean;
}) {
  const normalized = normalizeLicense(input.license);
  const attributionRequired = ["CC-BY", "CC-BY-SA", "Generated"].includes(normalized.spdxLike);
  const commercialUseAllowed = ["CC0", "CC-BY", "MIT", "Apache-2.0", "Generated", "User-Supplied"].includes(normalized.spdxLike);
  const blocked = ["CC-BY-NC", "CC-BY-NC-SA", "Editorial-Only", "Unknown"].includes(normalized.spdxLike);
  const manualReviewRequired = blocked || normalized.spdxLike === "Generated" || input.provider === "user_supplied";
  return {
    schema: "creative.pipeline.asset_license_policy.v1",
    generatedAt: new Date().toISOString(),
    title: input.title,
    provider: input.provider,
    licenseOriginal: input.license,
    licenseNormalized: normalized,
    sourceUrl: input.sourceUrl,
    generated: input.generated,
    status: blocked ? "blocked" : manualReviewRequired ? "review_required" : "allowed",
    commercialUseAllowed,
    attributionRequired,
    manualReviewRequired,
    postprocessQcRequired: true,
    sourceUrlSnapshotRequired: Boolean(input.sourceUrl),
    notes: [
      blocked ? "License is not safe for commercial delivery without manual clearance." : "License is acceptable only with recorded provenance.",
      attributionRequired ? "Attribution must be included in the delivery report." : "Attribution is not required by the normalized license policy.",
      "Final Blender QC is required before delivery."
    ]
  };
}

function normalizeLicense(license: string): { spdxLike: string; confidence: "high" | "medium" | "low" } {
  const text = license.trim().toLowerCase();
  if (["cc0", "cc-0", "creative commons zero"].includes(text)) return { spdxLike: "CC0", confidence: "high" };
  if (text.includes("cc-by-nc-sa")) return { spdxLike: "CC-BY-NC-SA", confidence: "high" };
  if (text.includes("cc-by-nc") || text.includes("noncommercial")) return { spdxLike: "CC-BY-NC", confidence: "high" };
  if (text.includes("cc-by-sa")) return { spdxLike: "CC-BY-SA", confidence: "high" };
  if (text.includes("cc-by") || text.includes("attribution")) return { spdxLike: "CC-BY", confidence: "high" };
  if (text.includes("apache")) return { spdxLike: "Apache-2.0", confidence: "high" };
  if (text.includes("mit")) return { spdxLike: "MIT", confidence: "high" };
  if (text.includes("generated")) return { spdxLike: "Generated", confidence: "medium" };
  if (text.includes("user")) return { spdxLike: "User-Supplied", confidence: "medium" };
  if (text.includes("editorial")) return { spdxLike: "Editorial-Only", confidence: "medium" };
  return { spdxLike: "Unknown", confidence: "low" };
}

async function normalizeSbomEntries(context: ToolExecutionContext, value: unknown): Promise<Array<{
  title: string;
  provider: string;
  path?: string;
  sourceUrl?: string;
  sha256?: string;
  licensePolicy: ReturnType<typeof evaluateLicense>;
  postprocessQcRequired: boolean;
}>> {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title : typeof record.path === "string" ? basename(record.path) : "asset";
    const provider = typeof record.provider === "string" ? record.provider : "unknown";
    const license = typeof record.license === "string" ? record.license : "Unknown";
    const path = typeof record.path === "string" ? record.path : undefined;
    let sha256: string | undefined;
    if (path) {
      try {
        const readablePath = await context.artifactStore.assertReadableFile(path);
        sha256 = createHash("sha256").update(await readFile(readablePath)).digest("hex");
      } catch {
        sha256 = undefined;
      }
    }
    const licensePolicy = evaluateLicense({
      title,
      provider,
      license,
      sourceUrl: typeof record.sourceUrl === "string" ? record.sourceUrl : undefined,
      generated: record.generated === true
    });
    entries.push({
      title,
      provider,
      path,
      sourceUrl: typeof record.sourceUrl === "string" ? record.sourceUrl : undefined,
      sha256,
      licensePolicy,
      postprocessQcRequired: true
    });
  }
  return entries;
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

async function downloadCandidateBytes(candidate: AssetCandidate): Promise<{ bytes: Uint8Array; resolvedUrl: string }> {
  let url = candidate.downloadUrl;
  if (!url) throw new Error("candidate.downloadUrl is required");
  if (candidate.provider === "sketchfab") {
    if (!process.env.SKETCHFAB_TOKEN) throw new Error("SKETCHFAB_TOKEN is required for Sketchfab downloads");
    const downloadInfo = await fetchJson<Record<string, unknown>>(url, {
      Authorization: `Token ${process.env.SKETCHFAB_TOKEN}`
    });
    url = findSketchfabArchiveUrl(downloadInfo);
    if (!url) throw new Error("Sketchfab download API did not expose a GLTF/GLB archive URL");
  }
  const response = await fetch(url, { headers: { "User-Agent": "creative-pipeline-mcp/asset-sourcing" } });
  if (!response.ok) throw new Error(`Asset download failed: ${response.status} ${response.statusText}`);
  return { bytes: new Uint8Array(await response.arrayBuffer()), resolvedUrl: url };
}

async function loadGeneratedResult(context: ToolExecutionContext, input: Record<string, unknown>): Promise<unknown> {
  if (input.falResult && typeof input.falResult === "object") return input.falResult;
  if (typeof input.falResultPath === "string") {
    const path = await context.artifactStore.assertReadableFile(input.falResultPath);
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  }
  throw new Error("falResult or falResultPath is required");
}

function extractGeneratedOutputs(value: unknown): Array<{ role: string; url: string; fileName: string }> {
  const found: Array<{ keyPath: string; url: string }> = [];
  collectUrls(value, [], found);
  const seen = new Set<string>();
  const outputs = found
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return generatedOutputRole(item.url, item.keyPath) !== "other";
    })
    .map((item, index) => {
      const role = generatedOutputRole(item.url, item.keyPath);
      return { role, url: item.url, fileName: generatedFileName(item.url, role, index) };
    });
  if (outputs.length === 0) throw new Error("No generated model, preview, or texture URLs found in result");
  outputs.sort((left, right) => outputRoleRank(left.role) - outputRoleRank(right.role));
  return outputs;
}

function collectUrls(value: unknown, path: string[], output: Array<{ keyPath: string; url: string }>): void {
  if (typeof value === "string") {
    if (/^https?:\/\//.test(value)) output.push({ keyPath: path.join("."), url: value });
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUrls(item, [...path, String(index)], output));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    collectUrls(nested, [...path, key], output);
  }
}

function generatedOutputRole(url: string, keyPath: string): "model" | "preview" | "texture" | "archive" | "other" {
  const text = `${keyPath} ${url}`.toLowerCase();
  if (/\.(glb|gltf|fbx|obj|usd|usdz)(?:[?#]|$)/.test(text) || /\b(model|mesh)\b/.test(text)) return "model";
  if (/\.(png|jpg|jpeg|webp)(?:[?#]|$)/.test(text) && /\b(preview|thumbnail|thumb|image)\b/.test(text)) return "preview";
  if (/\.(png|jpg|jpeg|webp|tif|tiff)(?:[?#]|$)/.test(text) && /\b(texture|albedo|normal|roughness|metallic|map)\b/.test(text)) return "texture";
  if (/\.(zip|tar|tgz)(?:[?#]|$)/.test(text) || /\b(archive|source)\b/.test(text)) return "archive";
  return "other";
}

function generatedFileName(url: string, role: string, index: number): string {
  const parsed = new URL(url);
  const originalExtension = extname(parsed.pathname).replace(/^\./, "").toLowerCase();
  const extension = originalExtension || (role === "model" ? "glb" : role === "archive" ? "zip" : "png");
  const suffix = role === "texture" ? `_${index}` : "";
  return `${role}${suffix}.${extension}`;
}

function outputRoleRank(role: string): number {
  if (role === "model") return 0;
  if (role === "archive") return 1;
  if (role === "preview") return 2;
  if (role === "texture") return 3;
  return 4;
}

async function downloadUrlBytes(url: string): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.CREATIVE_MCP_ASSET_FETCH_TIMEOUT_MS ?? 10000));
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "creative-pipeline-mcp/asset-sourcing" }
    });
    if (!response.ok) throw new Error(`Generated output download failed: ${response.status} ${response.statusText}`);
    return new Uint8Array(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, {
    headers: {
      ...headers,
      "Accept": "application/json",
      "User-Agent": "creative-pipeline-mcp/asset-sourcing"
    }
  });
  if (!response.ok) throw new Error(`JSON fetch failed: ${response.status} ${response.statusText}`);
  return await response.json() as T;
}

function findSketchfabArchiveUrl(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["gltf", "glb", "source"]) {
    const nested = record[key];
    if (nested && typeof nested === "object") {
      const url = (nested as Record<string, unknown>).url;
      if (typeof url === "string") return url;
    }
  }
  for (const nested of Object.values(record)) {
    if (nested && typeof nested === "object") {
      const url = findSketchfabArchiveUrl(nested);
      if (url) return url;
    }
  }
  return undefined;
}
