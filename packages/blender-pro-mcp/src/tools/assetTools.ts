import { existsSync } from "node:fs";
import { basename, parse } from "node:path";
import type { ToolDefinition } from "@creative-pipeline-mcp/core";
import { optimizeWithCli, renderWithHeadlessBlender } from "../adapters/cli.js";
import { placeholderPng } from "../adapters/preview.js";
import { artifactName, inspectAndReport, requirePath } from "./shared.js";

export const blenderTools: ToolDefinition[] = [
  {
    name: "blender.create_scene",
    description: "Create a scene-generation manifest for an external Blender bridge.",
    category: "blender",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { prompt: { type: "string" }, targetEngine: { type: "string" } },
      required: ["prompt"],
      additionalProperties: true
    },
    async execute(context, input) {
      const manifest = {
        prompt: String(input.prompt ?? ""),
        targetEngine: String(input.targetEngine ?? "WebGL"),
        outputs: ["scene.glb", "scene_preview.png", "scene_qc_report.json"],
        bridge: "external_blender_required"
      };
      const artifact = await context.artifactStore.writeJson("blender/create_scene_manifest.json", manifest);
      return { ok: true, message: "Scene manifest written", artifacts: [artifact], data: manifest };
    }
  },
  {
    name: "blender.apply_material",
    description: "Create a material-application manifest for MaterialX or Blender material adapters.",
    category: "blender",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, material: { type: "object" } },
      required: ["path"],
      additionalProperties: true
    },
    async execute(context, input) {
      const path = requirePath(input);
      await context.artifactStore.assertReadableFile(path);
      const manifest = { source: path, material: input.material ?? {}, adapter: "MaterialX_or_Blender_bridge" };
      const artifact = await context.artifactStore.writeJson(artifactName(path, "_material_apply_manifest.json"), manifest);
      return { ok: true, message: "Material application manifest written", artifacts: [artifact], data: manifest };
    }
  },
  {
    name: "blender.modify_asset",
    description: "Create a non-destructive modification manifest for an existing asset.",
    category: "blender",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, instructions: { type: "string" } },
      required: ["path", "instructions"],
      additionalProperties: true
    },
    async execute(context, input) {
      const path = requirePath(input);
      await context.artifactStore.assertReadableFile(path);
      const manifest = {
        source: path,
        instructions: String(input.instructions ?? ""),
        mode: "copy_then_modify",
        requiredQcAfterModify: true
      };
      const artifact = await context.artifactStore.writeJson(artifactName(path, "_modify_manifest.json"), manifest);
      return { ok: true, message: "Asset modification manifest written", artifacts: [artifact], data: manifest };
    }
  },
  {
    name: "blender.create_asset",
    description: "Alias-style manifest for creating a Blender asset through the external bridge.",
    category: "blender",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { prompt: { type: "string" } },
      required: ["prompt"],
      additionalProperties: true
    },
    async execute(context, input) {
      const manifest = {
        prompt: String(input.prompt ?? ""),
        outputs: ["asset.glb", "asset_preview.png", "asset_qc_report.json"],
        bridge: "external_blender_required"
      };
      const artifact = await context.artifactStore.writeJson("blender/create_asset_manifest.json", manifest);
      return { ok: true, message: "Asset creation manifest written", artifacts: [artifact], data: manifest };
    }
  },
  {
    name: "blender.inspect_scene",
    description: "Inspect a .glb/.gltf asset or report that external Blender is required for .blend.",
    category: "blender",
    risk: "read",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requirePath(input);
      await context.artifactStore.assertReadableFile(path);
      if (!existsSync(path)) {
        throw new Error(`Asset not found: ${path}`);
      }
      const report = await inspectAndReport(path);
      return {
        ok: report.summary.status !== "fail",
        message: `Scene inspection finished: ${report.summary.status}`,
        data: report as unknown as Record<string, unknown>
      };
    }
  },
  {
    name: "blender.configure_engine_profile",
    description: "Create a target engine profile for Roblox, Unity, Unreal, or WebGL asset budgets.",
    category: "blender",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { engine: { type: "string" } },
      required: ["engine"],
      additionalProperties: true
    },
    async execute(context, input) {
      const engine = String(input.engine ?? "WebGL");
      const profiles: Record<string, Record<string, unknown>> = {
        Roblox: { maxTriangles: 10000, textureMax: 1024, formats: ["glb"] },
        Unity: { maxTriangles: 50000, textureMax: 2048, formats: ["glb", "fbx"] },
        Unreal: { maxTriangles: 100000, textureMax: 4096, formats: ["glb", "usd"] },
        WebGL: { maxTriangles: 30000, textureMax: 2048, formats: ["glb"] }
      };
      const profile = profiles[engine] ?? profiles.WebGL;
      const artifact = await context.artifactStore.writeJson(`blender/engine_profile_${engine}.json`, profile);
      return { ok: true, message: "Engine profile written", artifacts: [artifact], data: profile };
    }
  },
  {
    name: "blender.create_usd_pipeline",
    description: "Create a USD pipeline manifest for v2 asset exchange workflows.",
    category: "blender",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: true
    },
    async execute(context, input) {
      const path = requirePath(input);
      await context.artifactStore.assertReadableFile(path);
      const manifest = {
        source: path,
        outputs: ["asset.usd", "asset_manifest.json"],
        adapters: ["OpenUSD", "MaterialX", "OCIO/ACES"],
        status: "external_adapter_required"
      };
      const artifact = await context.artifactStore.writeJson(artifactName(path, "_usd_pipeline_manifest.json"), manifest);
      return { ok: true, message: "USD pipeline manifest written", artifacts: [artifact], data: manifest };
    }
  },
  {
    name: "blender.create_materialx_workflow",
    description: "Create a MaterialX and OCIO/ACES lookdev workflow manifest.",
    category: "blender",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, look: { type: "string" } },
      required: ["path"],
      additionalProperties: true
    },
    async execute(context, input) {
      const path = requirePath(input);
      await context.artifactStore.assertReadableFile(path);
      const manifest = {
        source: path,
        look: String(input.look ?? "neutral_pbr"),
        adapters: ["MaterialX", "OpenImageIO", "OpenColorIO", "ACES"],
        outputs: ["lookdev.mtlx", "color_report.json"]
      };
      const artifact = await context.artifactStore.writeJson(artifactName(path, "_materialx_workflow.json"), manifest);
      return { ok: true, message: "MaterialX workflow manifest written", artifacts: [artifact], data: manifest };
    }
  },
  {
    name: "blender.plan_rig_animation",
    description: "Create an advanced rig/animation plan without executing raw Blender scripts.",
    category: "blender",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, animationBrief: { type: "string" } },
      required: ["path"],
      additionalProperties: true
    },
    async execute(context, input) {
      const path = requirePath(input);
      await context.artifactStore.assertReadableFile(path);
      const plan = {
        source: path,
        animationBrief: String(input.animationBrief ?? ""),
        steps: ["inspect_armature", "build_control_rig", "apply_animation", "export_preview", "validate_motion"],
        rawBpy: "approval_required"
      };
      const artifact = await context.artifactStore.writeJson(artifactName(path, "_rig_animation_plan.json"), plan);
      return { ok: true, message: "Rig/animation plan written", artifacts: [artifact], data: plan };
    }
  },
  {
    name: "blender.validate_asset",
    description: "Write a standardized asset QC report for a .glb/.gltf/.blend target.",
    category: "blender",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        maxTriangles: { type: "number" }
      },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requirePath(input);
      await context.artifactStore.assertReadableFile(path);
      const maxTriangles = typeof input.maxTriangles === "number" ? input.maxTriangles : 50000;
      const report = await inspectAndReport(path, maxTriangles);
      const artifact = await context.artifactStore.writeJson(artifactName(path, "_asset_qc_report.json"), report);
      return {
        ok: report.summary.status !== "fail",
        message: `Asset QC report written: ${report.summary.status}`,
        artifacts: [artifact],
        data: report as unknown as Record<string, unknown>
      };
    }
  },
  {
    name: "blender.render_preview",
    description: "Create a deterministic placeholder preview unless an external Blender renderer is configured.",
    category: "blender",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requirePath(input);
      await context.artifactStore.assertReadableFile(path);
      const artifact = await context.artifactStore.writeBytes(artifactName(path, "_preview.png"), placeholderPng());
      const render = await renderWithHeadlessBlender(path, artifact);
      if (render.available && !render.error) {
        return {
          ok: true,
          message: "Headless Blender preview rendered",
          artifacts: [artifact],
          data: { renderer: "blender_headless", command: render.command }
        };
      }
      return {
        ok: true,
        message: "Preview placeholder written; Blender headless renderer unavailable",
        artifacts: [artifact],
        data: { renderer: "placeholder", source: path, blender: render }
      };
    }
  },
  {
    name: "blender.optimize_asset",
    description: "Create an optimized artifact slot; copies source when external glTF optimizer is unavailable.",
    category: "blender",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requirePath(input);
      await context.artifactStore.assertReadableFile(path);
      const target = artifactName(path, "_optimized.glb");
      const artifact = await context.artifactStore.writeBytes(target, new Uint8Array());
      const optimized = await optimizeWithCli(path, artifact);
      if (optimized.available && !optimized.error) {
        return {
          ok: true,
          message: "Optimized artifact written with external glTF optimizer",
          artifacts: [artifact],
          data: { optimizer: optimized.command, source: path }
        };
      }
      const fallback = await context.artifactStore.copyIn(path, target);
      return {
        ok: true,
        message: "Optimized artifact written by copy fallback; glTF optimizer unavailable or failed",
        artifacts: [fallback],
        data: { optimizer: "copy_fallback", source: path, cli: optimized }
      };
    }
  },
  {
    name: "blender.export_game_ready",
    description: "Export a game-ready artifact copy and QC report.",
    category: "blender",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        maxTriangles: { type: "number" }
      },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requirePath(input);
      await context.artifactStore.assertReadableFile(path);
      const report = await inspectAndReport(path, typeof input.maxTriangles === "number" ? input.maxTriangles : 50000);
      const exported = await context.artifactStore.copyIn(path, artifactName(path, "_game_ready.glb"));
      const qc = await context.artifactStore.writeJson(artifactName(path, "_game_ready_qc.json"), report);
      return {
        ok: report.summary.status !== "fail",
        message: `Game-ready export fallback completed: ${report.summary.status}`,
        artifacts: [exported, qc],
        data: report as unknown as Record<string, unknown>
      };
    }
  },
  {
    name: "blender.create_game_asset",
    description: "Create a production job manifest for an external Blender bridge to generate a game asset.",
    category: "blender",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        budget: { type: "object" }
      },
      required: ["prompt"],
      additionalProperties: true
    },
    async execute(context, input) {
      const prompt = String(input.prompt ?? "");
      const manifest = {
        prompt,
        target: "game_ready_glb",
        excluded: ["3D-Agent"],
        requiredQc: ["triangle_budget", "origin", "scale", "normals", "textures", "export_success"],
        bridge: "external_blender_required"
      };
      const artifact = await context.artifactStore.writeJson("blender/create_game_asset_job.json", manifest);
      return {
        ok: true,
        message: "Game asset job manifest written for external Blender execution",
        artifacts: [artifact],
        data: manifest
      };
    }
  },
  {
    name: "blender.create_material_pack",
    description: "Create a material-pack manifest for MaterialX/OpenImageIO/OpenColorIO-capable adapters.",
    category: "blender",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { prompt: { type: "string" } },
      required: ["prompt"],
      additionalProperties: true
    },
    async execute(context, input) {
      const artifact = await context.artifactStore.writeJson("blender/material_pack_manifest.json", {
        prompt: String(input.prompt ?? ""),
        adapters: ["MaterialX", "OpenImageIO", "OpenColorIO"],
        status: "external_adapter_required"
      });
      return { ok: true, message: "Material pack manifest written", artifacts: [artifact] };
    }
  },
  {
    name: "blender.fix_asset_issues",
    description: "Create a repair plan from an asset QC report.",
    category: "blender",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requirePath(input);
      await context.artifactStore.assertReadableFile(path);
      const report = await inspectAndReport(path);
      const plan = {
        source: basename(path),
        fixes: report.checks
          .filter((check) => check.status === "warn" || check.status === "fail")
          .map((check) => ({ check: check.id, action: `route_to_adapter_for_${check.id.replaceAll(".", "_")}` }))
      };
      const artifact = await context.artifactStore.writeJson(
        `blender/${parse(basename(path)).name}_repair_plan.json`,
        plan
      );
      return { ok: true, message: "Asset repair plan written", artifacts: [artifact], data: plan };
    }
  }
];
