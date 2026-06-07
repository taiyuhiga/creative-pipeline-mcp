import type { ToolDefinition } from "../../core/dist/index.js";

export const directorTools: ToolDefinition[] = [
  {
    name: "director.plan_production",
    description: "Create a full Blender-to-Premiere production plan with QC gates.",
    category: "core",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { brief: { type: "string", maxLength: 4000 } },
      required: ["brief"],
      additionalProperties: false
    },
    async execute(context, input) {
      const plan = {
        brief: String(input.brief ?? ""),
        stages: [
          "blender.create_game_asset",
          "blender.validate_asset",
          "blender.render_preview",
          "director.handoff_blender_asset",
          "premiere.ingest_media",
          "premiere.make_rough_cut",
          "premiere.auto_caption",
          "premiere.mix_audio",
          "premiere.export_video",
          "premiere.run_delivery_qc",
          "director.full_production_report"
        ],
        reviews: ["asset_qc", "edit_qc", "license_manifest", "safety_policy"]
      };
      const artifact = await context.artifactStore.writeJson("director/production_plan.json", plan);
      return { ok: true, message: "Production plan written", artifacts: [artifact], data: plan };
    }
  },
  {
    name: "director.handoff_blender_asset",
    description: "Create an asset manifest for Blender to Premiere handoff.",
    category: "core",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        assetPath: { type: "string" },
        previewPath: { type: "string" },
        qcReportPath: { type: "string" }
      },
      required: ["assetPath"],
      additionalProperties: false
    },
    async execute(context, input) {
      const manifest = {
        assetPath: String(input.assetPath ?? ""),
        previewPath: String(input.previewPath ?? ""),
        qcReportPath: String(input.qcReportPath ?? ""),
        premiereUsage: ["broll", "title_card", "product_visual"],
        requiredBeforeEdit: ["asset_qc_pass_or_waived", "license_manifest_recorded"]
      };
      const artifact = await context.artifactStore.writeJson("director/blender_to_premiere_asset_manifest.json", manifest);
      return { ok: true, message: "Blender to Premiere handoff manifest written", artifacts: [artifact], data: manifest };
    }
  },
  {
    name: "director.full_production_report",
    description: "Create a full production report linking asset, edit, QC, approval, and license artifacts.",
    category: "core",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        artifacts: { type: "array" }
      },
      required: ["project"],
      additionalProperties: false
    },
    async execute(context, input) {
      const report = {
        project: String(input.project ?? ""),
        generatedAt: new Date().toISOString(),
        artifacts: Array.isArray(input.artifacts) ? input.artifacts : [],
        sections: ["asset_manifest", "edit_manifest", "qc_reports", "approval_records", "license_manifest"],
        status: "ready_for_human_review"
      };
      const artifact = await context.artifactStore.writeJson("director/full_production_report.json", report);
      return { ok: true, message: "Full production report written", artifacts: [artifact], data: report };
    }
  },
  {
    name: "director.multi_agent_review",
    description: "Create a multi-agent review checklist for asset, edit, audio, captions, safety, and licensing.",
    category: "core",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { project: { type: "string", maxLength: 200 } },
      required: ["project"],
      additionalProperties: false
    },
    async execute(context, input) {
      const review = {
        project: String(input.project ?? ""),
        reviewers: [
          { role: "asset_qc", checks: ["geometry", "materials", "engine_profile", "export"] },
          { role: "edit_qc", checks: ["duration", "black_frames", "caption_overlap", "delivery_profile"] },
          { role: "audio_qc", checks: ["loudness", "clipping", "silence"] },
          { role: "license_qc", checks: ["gpl_boundary", "asset_rights", "trademark_notes"] },
          { role: "safety_qc", checks: ["approval_records", "raw_script_absent", "copy_workflow"] }
        ]
      };
      const artifact = await context.artifactStore.writeJson("director/multi_agent_review.json", review);
      return { ok: true, message: "Multi-agent review checklist written", artifacts: [artifact], data: review };
    }
  }
];
