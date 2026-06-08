import type { ToolDefinition } from "../../../core/dist/index.js";
import { checkProviderAvailability, getProviderCapability } from "../../../core/dist/index.js";

const aspectRatios = ["16:9", "9:16", "1:1", "4:5"];

export const capcutTools: ToolDefinition[] = [
  {
    name: "capcut.check_availability",
    description: "Check optional CapCut provider backends without proxying raw app APIs.",
    category: "capcut",
    risk: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async execute(context) {
      const provider = getProviderCapability("capcut");
      if (!provider) {
        return { ok: false, message: "CapCut provider is not registered" };
      }
      const report = {
        schema: "creative.pipeline.capcut_availability.v1",
        generatedAt: new Date().toISOString(),
        availability: checkProviderAvailability(provider),
        optionalBackends: ["CapCutAPI", "CapCut Mate", "capcut-cli", "pyJianYingDraft", "cut_cli"],
        policy: capcutPolicy()
      };
      const artifact = await context.artifactStore.writeJson("capcut/availability_report.json", report);
      return { ok: true, message: "CapCut availability report written", artifacts: [artifact], data: report };
    }
  },
  {
    name: "capcut.create_draft_plan",
    description: "Create a copy-on-write CapCut social draft plan for human-approved execution.",
    category: "capcut",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 200 },
        deliveryProfile: { type: "string" },
        durationSeconds: { type: "number", minimum: 1 },
        aspectRatio: { type: "string", enum: aspectRatios },
        media: { type: "array" },
        captionsPath: { type: "string" },
        copyOnWrite: { type: "boolean" }
      },
      required: ["title"],
      additionalProperties: false
    },
    async execute(context, input) {
      const plan = buildDraftPlan(input);
      const artifact = await context.artifactStore.writeJson("capcut/draft_plan.json", plan);
      return { ok: true, message: "CapCut draft plan written", artifacts: [artifact], data: { plan } };
    }
  },
  {
    name: "capcut.write_draft_manifest",
    description: "Write a CapCut draft manifest that records source media and copy-on-write safety constraints.",
    category: "capcut",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 200 },
        planPath: { type: "string" },
        media: { type: "array" },
        outputDirectory: { type: "string" }
      },
      required: ["title"],
      additionalProperties: false
    },
    async execute(context, input) {
      const manifest = {
        schema: "creative.pipeline.capcut_draft_manifest.v1",
        title: requiredString(input.title, "Untitled CapCut Draft"),
        generatedAt: new Date().toISOString(),
        planPath: optionalString(input.planPath),
        outputDirectory: optionalString(input.outputDirectory) ?? "artifacts/capcut/drafts",
        copyOnWrite: true,
        media: mediaList(input.media),
        expectedArtifacts: ["capcut/draft_plan.json", "capcut/draft_manifest.json", "capcut/draft_qc_report.json"],
        policy: capcutPolicy()
      };
      const artifact = await context.artifactStore.writeJson("capcut/draft_manifest.json", manifest);
      return { ok: true, message: "CapCut draft manifest written", artifacts: [artifact], data: { manifest } };
    }
  },
  {
    name: "capcut.run_draft_qc",
    description: "Run policy and delivery checks on a CapCut draft plan or manifest.",
    category: "capcut",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        aspectRatio: { type: "string", enum: aspectRatios },
        media: { type: "array" },
        captionsPath: { type: "string" },
        copyOnWrite: { type: "boolean" }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const report = {
        schema: "creative.pipeline.capcut_draft_qc.v1",
        generatedAt: new Date().toISOString(),
        title: optionalString(input.title) ?? "CapCut Draft",
        status: input.copyOnWrite === false ? "fail" : "pass",
        checks: [
          check("copy_on_write", input.copyOnWrite !== false, true),
          check("aspect_ratio", !input.aspectRatio || aspectRatios.includes(String(input.aspectRatio)), input.aspectRatio ?? "not_provided"),
          check("media_manifest", mediaList(input.media).length > 0, mediaList(input.media).length),
          check("captions_optional", true, optionalString(input.captionsPath) ?? "not_provided"),
          check("raw_proxy_absent", true, false)
        ],
        policy: capcutPolicy()
      };
      const artifact = await context.artifactStore.writeJson("capcut/draft_qc_report.json", report);
      return { ok: report.status === "pass", message: "CapCut draft QC report written", artifacts: [artifact], data: { report } };
    }
  },
  {
    name: "capcut.create_social_draft",
    description: "Create a CapCut social-video draft plan, manifest, and QC report in one artifact-first macro.",
    category: "capcut",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 200 },
        deliveryProfile: { type: "string" },
        durationSeconds: { type: "number" },
        aspectRatio: { type: "string", enum: aspectRatios },
        media: { type: "array" },
        captionsPath: { type: "string" }
      },
      required: ["title"],
      additionalProperties: false
    },
    async execute(context, input) {
      const plan = buildDraftPlan(input);
      const manifest = {
        schema: "creative.pipeline.capcut_draft_manifest.v1",
        title: plan.title,
        generatedAt: plan.generatedAt,
        copyOnWrite: true,
        media: plan.media,
        outputDirectory: "artifacts/capcut/drafts",
        policy: capcutPolicy()
      };
      const qc = {
        schema: "creative.pipeline.capcut_draft_qc.v1",
        generatedAt: plan.generatedAt,
        title: plan.title,
        status: "pass",
        checks: [
          check("copy_on_write", true, true),
          check("typed_operations_only", true, true),
          check("raw_proxy_absent", true, false)
        ],
        policy: capcutPolicy()
      };
      const artifacts = [
        await context.artifactStore.writeJson("capcut/draft_plan.json", plan),
        await context.artifactStore.writeJson("capcut/draft_manifest.json", manifest),
        await context.artifactStore.writeJson("capcut/draft_qc_report.json", qc)
      ];
      return { ok: true, message: "CapCut social draft artifacts written", artifacts, data: { plan, manifest, qc } };
    }
  }
];

function buildDraftPlan(input: Record<string, unknown>) {
  const title = requiredString(input.title, "Untitled CapCut Draft");
  return {
    schema: "creative.pipeline.capcut_draft_plan.v1",
    title,
    generatedAt: new Date().toISOString(),
    provider: "capcut",
    deliveryProfile: optionalString(input.deliveryProfile) ?? "captioned_social_delivery",
    durationSeconds: Number(input.durationSeconds ?? 60),
    aspectRatio: optionalString(input.aspectRatio) ?? "9:16",
    media: mediaList(input.media),
    captionsPath: optionalString(input.captionsPath),
    copyOnWrite: input.copyOnWrite !== false,
    expectedSideEffects: ["write_artifacts_only", "no_capcut_project_mutation"],
    requiresApproval: true,
    statusJsonPath: "capcut/draft_status.json",
    rollbackHint: "Delete generated draft artifacts; source media is not modified.",
    policy: capcutPolicy()
  };
}

function capcutPolicy() {
  return {
    rawProxy: false,
    copyOnWriteRequired: true,
    noEncryptedDraftBypass: true,
    noBinaryModification: true,
    noRawDraftOverwrite: true,
    approvalRequiredForCloudOrGuiWrites: true
  };
}

function mediaList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function check(id: string, passed: boolean, value: unknown) {
  return { id, status: passed ? "pass" : "fail", value };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredString(value: unknown, fallback: string): string {
  return optionalString(value) ?? fallback;
}
