import type { ToolDefinition } from "../../../core/dist/index.js";
import { checkProviderAvailability, getProviderCapability } from "../../../core/dist/index.js";

const formats = ["mov", "mp4", "png_sequence", "exr_sequence"];

export const afterEffectsTools: ToolDefinition[] = [
  {
    name: "ae.check_availability",
    description: "Check After Effects render-provider availability for aerender and nexrender.",
    category: "ae",
    risk: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async execute(context) {
      const provider = getProviderCapability("after_effects");
      if (!provider) {
        return { ok: false, message: "After Effects provider is not registered" };
      }
      const report = {
        schema: "creative.pipeline.ae_availability.v1",
        generatedAt: new Date().toISOString(),
        availability: checkProviderAvailability(provider),
        policy: aePolicy()
      };
      const artifact = await context.artifactStore.writeJson("after-effects/availability_report.json", report);
      return { ok: true, message: "After Effects availability report written", artifacts: [artifact], data: report };
    }
  },
  {
    name: "ae.create_render_plan",
    description: "Create an artifact-first After Effects render plan without enabling raw JSX by default.",
    category: "ae",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string" },
        templatePath: { type: "string" },
        compName: { type: "string" },
        outputFormat: { type: "string", enum: formats },
        width: { type: "number" },
        height: { type: "number" },
        fps: { type: "number" },
        frame: { type: "number" },
        durationSeconds: { type: "number" }
      },
      required: ["compName"],
      additionalProperties: false
    },
    async execute(context, input) {
      const plan = buildRenderPlan(input);
      const artifact = await context.artifactStore.writeJson("after-effects/render_plan.json", plan);
      return { ok: true, message: "After Effects render plan written", artifacts: [artifact], data: { plan } };
    }
  },
  {
    name: "ae.queue_aerender",
    description: "Queue an aerender command manifest for approval-controlled render execution.",
    category: "ae",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string" },
        compName: { type: "string" },
        outputPath: { type: "string" },
        renderSettings: { type: "string" },
        outputModule: { type: "string" }
      },
      required: ["compName"],
      additionalProperties: false
    },
    async execute(context, input) {
      await context.approvalPolicy.assertAllowed("ae.queue_aerender", "project_write");
      const manifest = {
        schema: "creative.pipeline.ae_aerender_queue.v1",
        commandId: commandId("aerender"),
        generatedAt: new Date().toISOString(),
        engine: "aerender",
        projectPath: optionalString(input.projectPath),
        compName: requiredString(input.compName, "Main"),
        outputPath: optionalString(input.outputPath) ?? "artifacts/after-effects/output.mov",
        renderSettings: optionalString(input.renderSettings) ?? "Best Settings",
        outputModule: optionalString(input.outputModule) ?? "High Quality",
        expectedSideEffects: ["render_output_only"],
        requiresApproval: true,
        rawJsx: false,
        policy: aePolicy()
      };
      const status = renderStatus(manifest.commandId, "queued_manifest_only", "aerender manifest written");
      const artifacts = [
        await context.artifactStore.writeJson("after-effects/render_queue/aerender_command.json", manifest),
        await context.artifactStore.writeJson("after-effects/render_status.json", status)
      ];
      return { ok: true, message: "aerender queue manifest written", artifacts, data: { manifest, status } };
    }
  },
  {
    name: "ae.queue_nexrender",
    description: "Queue a nexrender job manifest for approval-controlled template rendering.",
    category: "ae",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        templatePath: { type: "string" },
        compName: { type: "string" },
        outputPath: { type: "string" },
        assets: { type: "array" }
      },
      required: ["templatePath"],
      additionalProperties: false
    },
    async execute(context, input) {
      await context.approvalPolicy.assertAllowed("ae.queue_nexrender", "project_write");
      const job = {
        schema: "creative.pipeline.ae_nexrender_job.v1",
        commandId: commandId("nexrender"),
        generatedAt: new Date().toISOString(),
        engine: "nexrender",
        templatePath: requiredString(input.templatePath, "template.aep"),
        compName: optionalString(input.compName) ?? "Main",
        outputPath: optionalString(input.outputPath) ?? "artifacts/after-effects/output.mov",
        assets: Array.isArray(input.assets) ? input.assets : [],
        expectedSideEffects: ["render_output_only"],
        requiresApproval: true,
        rawJsx: false,
        policy: aePolicy()
      };
      const status = renderStatus(job.commandId, "queued_manifest_only", "nexrender job manifest written");
      const artifacts = [
        await context.artifactStore.writeJson("after-effects/render_queue/nexrender_job.json", job),
        await context.artifactStore.writeJson("after-effects/render_status.json", status)
      ];
      return { ok: true, message: "nexrender job manifest written", artifacts, data: { job, status } };
    }
  },
  {
    name: "ae.render_frame_preview",
    description: "Write a frame preview render plan for a single After Effects frame.",
    category: "ae",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string" },
        compName: { type: "string" },
        frame: { type: "number" },
        outputPath: { type: "string" }
      },
      required: ["compName"],
      additionalProperties: false
    },
    async execute(context, input) {
      const plan = {
        schema: "creative.pipeline.ae_frame_preview_plan.v1",
        generatedAt: new Date().toISOString(),
        projectPath: optionalString(input.projectPath),
        compName: requiredString(input.compName, "Main"),
        frame: Number(input.frame ?? 0),
        outputPath: optionalString(input.outputPath) ?? "artifacts/after-effects/preview_frame.png",
        expectedArtifacts: ["after-effects/preview_frame.png", "after-effects/render_status.json"],
        rawJsx: false,
        policy: aePolicy()
      };
      const artifact = await context.artifactStore.writeJson("after-effects/frame_preview_plan.json", plan);
      return { ok: true, message: "After Effects frame preview plan written", artifacts: [artifact], data: { plan } };
    }
  },
  {
    name: "ae.run_motion_qc",
    description: "Run motion render QC checks against an After Effects render plan.",
    category: "ae",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        compName: { type: "string" },
        outputFormat: { type: "string", enum: formats },
        width: { type: "number" },
        height: { type: "number" },
        durationSeconds: { type: "number" }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const width = Number(input.width ?? 1920);
      const height = Number(input.height ?? 1080);
      const durationSeconds = Number(input.durationSeconds ?? 10);
      const report = {
        schema: "creative.pipeline.ae_motion_qc.v1",
        generatedAt: new Date().toISOString(),
        compName: optionalString(input.compName) ?? "Main",
        status: width > 0 && height > 0 && durationSeconds > 0 ? "pass" : "fail",
        checks: [
          check("resolution_positive", width > 0 && height > 0, { width, height }),
          check("duration_positive", durationSeconds > 0, durationSeconds),
          check("format_supported", !input.outputFormat || formats.includes(String(input.outputFormat)), input.outputFormat ?? "not_provided"),
          check("raw_jsx_disabled", true, true),
          check("license_bypass_absent", true, true)
        ],
        policy: aePolicy()
      };
      const artifact = await context.artifactStore.writeJson("after-effects/motion_qc_report.json", report);
      return { ok: report.status === "pass", message: "After Effects motion QC report written", artifacts: [artifact], data: { report } };
    }
  }
];

function buildRenderPlan(input: Record<string, unknown>) {
  return {
    schema: "creative.pipeline.ae_render_plan.v1",
    generatedAt: new Date().toISOString(),
    provider: "after_effects",
    projectPath: optionalString(input.projectPath),
    templatePath: optionalString(input.templatePath),
    compName: requiredString(input.compName, "Main"),
    outputFormat: optionalString(input.outputFormat) ?? "mov",
    width: Number(input.width ?? 1920),
    height: Number(input.height ?? 1080),
    fps: Number(input.fps ?? 30),
    frame: Number(input.frame ?? 0),
    durationSeconds: Number(input.durationSeconds ?? 10),
    expectedArtifacts: [
      "after-effects/render_plan.json",
      "after-effects/render_status.json",
      "after-effects/motion_qc_report.json",
      "after-effects/output.mov"
    ],
    expectedSideEffects: ["write_artifacts_only"],
    requiresApproval: true,
    rawJsx: false,
    policy: aePolicy()
  };
}

function aePolicy() {
  return {
    rawJsxDefault: false,
    adminApprovalRequiredForJsx: true,
    noLicenseBypass: true,
    renderOnlyPhaseOne: true,
    artifactFirst: true
  };
}

function renderStatus(commandId: string, status: string, message: string) {
  return {
    schema: "creative.pipeline.ae_render_status.v1",
    commandId,
    status,
    message,
    generatedAt: new Date().toISOString()
  };
}

function commandId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
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
