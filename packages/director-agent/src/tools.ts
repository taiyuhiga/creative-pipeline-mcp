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
  },
  {
    name: "director.create_social_video",
    description: "Create a provider-aware social video plan with Premiere first and CapCut fallback.",
    category: "core",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        brief: { type: "string", maxLength: 4000 },
        deliveryProfile: { type: "string" },
        preferredProvider: { type: "string" }
      },
      required: ["brief"],
      additionalProperties: false
    },
    async execute(context, input) {
      const plan = {
        schema: "creative.pipeline.director_social_video_plan.v1",
        brief: String(input.brief ?? ""),
        deliveryProfile: String(input.deliveryProfile ?? "captioned_social_delivery"),
        preferredProvider: typeof input.preferredProvider === "string" ? input.preferredProvider : "premiere",
        providerResolutionTool: "provider.resolve_video_editor",
        stages: [
          "asset.resolve_source_plan",
          "asset.acquire_or_generate",
          "premiere.ingest_media",
          "premiere.make_rough_cut",
          "premiere.run_delivery_qc",
          "capcut.create_social_draft",
          "capcut.run_draft_qc",
          "director.full_production_report"
        ],
        fallbackPolicy: {
          premiereUnavailable: "capcut.create_social_draft",
          capcutUnavailable: "write manifest-only edit plan",
          rawProxy: false
        },
        approvals: ["project_write_tools", "external_gui_or_cloud_writes"]
      };
      const artifact = await context.artifactStore.writeJson("director/social_video_plan.json", plan);
      return { ok: true, message: "Social video provider plan written", artifacts: [artifact], data: plan };
    }
  },
  {
    name: "director.create_motion_package",
    description: "Create an After Effects/Blender motion package plan with render QC gates.",
    category: "core",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        brief: { type: "string", maxLength: 4000 },
        compName: { type: "string" },
        deliveryProfile: { type: "string" }
      },
      required: ["brief"],
      additionalProperties: false
    },
    async execute(context, input) {
      const plan = {
        schema: "creative.pipeline.director_motion_package_plan.v1",
        brief: String(input.brief ?? ""),
        compName: String(input.compName ?? "Main"),
        deliveryProfile: String(input.deliveryProfile ?? "motion_package_high_quality"),
        providerResolutionTool: "provider.resolve_motion_engine",
        stages: [
          "ae.check_availability",
          "ae.create_render_plan",
          "ae.render_frame_preview",
          "ae.queue_aerender",
          "ae.queue_nexrender",
          "ae.run_motion_qc",
          "director.full_production_report"
        ],
        fallbackPolicy: {
          afterEffectsUnavailable: "blender.render_preview",
          rawJsxDefault: false
        },
        approvals: ["render_queue", "external_app_write"]
      };
      const artifact = await context.artifactStore.writeJson("director/motion_package_plan.json", plan);
      return { ok: true, message: "Motion package provider plan written", artifacts: [artifact], data: plan };
    }
  },
  {
    name: "director.build_roblox_feature",
    description: "Create a Roblox feature build plan focused on read-only inspection, Luau QC, and command manifests.",
    category: "core",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        brief: { type: "string", maxLength: 4000 },
        projectRoot: { type: "string" }
      },
      required: ["brief"],
      additionalProperties: false
    },
    async execute(context, input) {
      const plan = {
        schema: "creative.pipeline.director_roblox_feature_plan.v1",
        brief: String(input.brief ?? ""),
        projectRoot: typeof input.projectRoot === "string" ? input.projectRoot : undefined,
        providerResolutionTool: "provider.resolve_game_engine",
        stages: [
          "roblox.check_availability",
          "roblox.inspect_project",
          "roblox.inspect_place_tree",
          "roblox.index_scripts",
          "roblox.validate_luau_project",
          "roblox.run_selene",
          "roblox.run_stylua_check",
          "roblox.generate_project_report"
        ],
        blockedOperations: ["executor_tools", "client_exploit_tools", "raw_studio_proxy", "default_place_publish"],
        approvals: ["any future Studio write", "package install", "publish"]
      };
      const artifact = await context.artifactStore.writeJson("director/roblox_feature_plan.json", plan);
      return { ok: true, message: "Roblox feature plan written", artifacts: [artifact], data: plan };
    }
  },
  {
    name: "director.create_roblox_trailer",
    description: "Create a Roblox trailer plan that combines Roblox project QC with video-provider delivery.",
    category: "core",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        brief: { type: "string", maxLength: 4000 },
        deliveryProfile: { type: "string" }
      },
      required: ["brief"],
      additionalProperties: false
    },
    async execute(context, input) {
      const plan = {
        schema: "creative.pipeline.director_roblox_trailer_plan.v1",
        brief: String(input.brief ?? ""),
        deliveryProfile: String(input.deliveryProfile ?? "youtube_4k_high_quality"),
        providerResolutionTools: ["provider.resolve_game_engine", "provider.resolve_video_editor"],
        stages: [
          "roblox.generate_project_report",
          "asset.acquire_or_generate",
          "premiere.build_project_delivery",
          "capcut.create_social_draft",
          "premiere.run_delivery_qc",
          "director.full_production_report"
        ],
        fallbackPolicy: {
          premiereUnavailable: "capcut.create_social_draft",
          robloxWrites: "read_only_qc_until_explicit_approval"
        }
      };
      const artifact = await context.artifactStore.writeJson("director/roblox_trailer_plan.json", plan);
      return { ok: true, message: "Roblox trailer provider plan written", artifacts: [artifact], data: plan };
    }
  }
];
