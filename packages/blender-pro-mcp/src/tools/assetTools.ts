import { existsSync, statSync } from "node:fs";
import { basename, parse } from "node:path";
import type { ToolDefinition } from "@creative-pipeline-mcp/core";
import {
  enqueueBlenderBridgeCommand,
  findBlenderBridgeStatus,
  listBlenderBridgeStatuses
} from "../adapters/blenderBridge.js";
import { optimizeWithCli, renderWithHeadlessBlender, runHeadlessBlenderScript } from "../adapters/cli.js";
import { placeholderPng } from "../adapters/preview.js";
import { artifactName, inspectAndReport, requirePath } from "./shared.js";

export const blenderTools: ToolDefinition[] = [
  {
    name: "blender.read_bridge_status",
    description: "Read Blender bridge status JSON files produced by a trusted bridge adapter.",
    category: "blender",
    risk: "read",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    async execute() {
      const statuses = await listBlenderBridgeStatuses();
      return {
        ok: true,
        message: `${statuses.length} Blender bridge status records found`,
        data: { statuses }
      };
    }
  },
  {
    name: "blender.await_bridge_status",
    description: "Poll Blender bridge status files until a matching command status is available.",
    category: "blender",
    risk: "read",
    inputSchema: {
      type: "object",
      properties: {
        commandId: { type: "string" },
        commandType: {
          type: "string",
          enum: ["create_scene", "create_asset", "modify_asset", "apply_material", "run_safe_script"]
        },
        timeoutMs: { type: "number" },
        pollIntervalMs: { type: "number" }
      },
      additionalProperties: false
    },
    async execute(_context, input) {
      const timeoutMs = Math.max(0, Math.min(typeof input.timeoutMs === "number" ? input.timeoutMs : 0, 120000));
      const pollIntervalMs = Math.max(100, Math.min(typeof input.pollIntervalMs === "number" ? input.pollIntervalMs : 1000, 10000));
      const deadline = Date.now() + timeoutMs;
      do {
        const match = await findBlenderBridgeStatus({
          commandId: typeof input.commandId === "string" ? input.commandId : undefined,
          commandType: isBlenderBridgeCommandType(input.commandType) ? input.commandType : undefined
        });
        if (match) {
          return {
            ok: true,
            message: `Blender bridge status found: ${match.status.status}`,
            data: match
          };
        }
        if (Date.now() >= deadline) {
          break;
        }
        await sleep(pollIntervalMs);
      } while (true);
      return {
        ok: false,
        message: "Blender bridge status not found before timeout",
        data: { commandId: input.commandId, commandType: input.commandType, timeoutMs }
      };
    }
  },
  {
    name: "blender.create_scene",
    description: "Create a scene-generation manifest for an external Blender bridge.",
    category: "blender",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", maxLength: 2000 },
        targetEngine: { type: "string", enum: ["Roblox", "Unity", "Unreal", "WebGL"] }
      },
      required: ["prompt"],
      additionalProperties: false
    },
    async execute(context, input) {
      const manifest = {
        prompt: String(input.prompt ?? ""),
        targetEngine: String(input.targetEngine ?? "WebGL"),
        outputs: ["scene.glb", "scene_preview.png", "scene_qc_report.json"],
        bridge: "queued_blender_bridge_required"
      };
      const artifact = await context.artifactStore.writeJson("blender/create_scene_manifest.json", manifest);
      const queued = await enqueueBlenderBridgeCommand("create_scene", manifest);
      return {
        ok: true,
        message: "Scene manifest written and Blender bridge command queued",
        artifacts: [artifact, queued.path],
        data: { manifest, command: queued.command }
      };
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
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requirePath(input);
      await context.artifactStore.assertReadableFile(path);
      const manifest = { source: path, material: input.material ?? {}, adapter: "MaterialX_or_Blender_bridge" };
      const artifact = await context.artifactStore.writeJson(artifactName(path, "_material_apply_manifest.json"), manifest);
      const queued = await enqueueBlenderBridgeCommand("apply_material", manifest);
      return {
        ok: true,
        message: "Material application manifest written and Blender bridge command queued",
        artifacts: [artifact, queued.path],
        data: { manifest, command: queued.command }
      };
    }
  },
  {
    name: "blender.modify_asset",
    description: "Create a non-destructive modification manifest for an existing asset.",
    category: "blender",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, instructions: { type: "string", maxLength: 4000 } },
      required: ["path", "instructions"],
      additionalProperties: false
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
      const queued = await enqueueBlenderBridgeCommand("modify_asset", manifest);
      return {
        ok: true,
        message: "Asset modification manifest written and Blender bridge command queued",
        artifacts: [artifact, queued.path],
        data: { manifest, command: queued.command }
      };
    }
  },
  {
    name: "blender.create_asset",
    description: "Alias-style manifest for creating a Blender asset through the external bridge.",
    category: "blender",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { prompt: { type: "string", maxLength: 2000 } },
      required: ["prompt"],
      additionalProperties: false
    },
    async execute(context, input) {
      const manifest = {
        prompt: String(input.prompt ?? ""),
        outputs: ["asset.glb", "asset_preview.png", "asset_qc_report.json"],
        bridge: "queued_blender_bridge_required"
      };
      const artifact = await context.artifactStore.writeJson("blender/create_asset_manifest.json", manifest);
      const queued = await enqueueBlenderBridgeCommand("create_asset", manifest);
      return {
        ok: true,
        message: "Asset creation manifest written and Blender bridge command queued",
        artifacts: [artifact, queued.path],
        data: { manifest, command: queued.command }
      };
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
      properties: { engine: { type: "string", enum: ["Roblox", "Unity", "Unreal", "WebGL"] } },
      required: ["engine"],
      additionalProperties: false
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
      additionalProperties: false
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
      properties: { path: { type: "string" }, look: { type: "string", maxLength: 200 } },
      required: ["path"],
      additionalProperties: false
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
      properties: { path: { type: "string" }, animationBrief: { type: "string", maxLength: 4000 } },
      required: ["path"],
      additionalProperties: false
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
        const sourceBytes = statSync(path).size;
        const optimizedBytes = statSync(artifact).size;
        return {
          ok: true,
          message: "Optimized artifact written with external glTF optimizer",
          artifacts: [artifact],
          data: {
            optimizer: optimized.command,
            source: path,
            sourceBytes,
            optimizedBytes,
            deltaBytes: optimizedBytes - sourceBytes,
            ratio: sourceBytes > 0 ? optimizedBytes / sourceBytes : null
          }
        };
      }
      const fallback = await context.artifactStore.copyIn(path, target);
      const sourceBytes = statSync(path).size;
      const fallbackBytes = statSync(fallback).size;
      return {
        ok: true,
        message: "Optimized artifact written by copy fallback; glTF optimizer unavailable or failed",
        artifacts: [fallback],
        data: {
          optimizer: "copy_fallback",
          source: path,
          sourceBytes,
          optimizedBytes: fallbackBytes,
          deltaBytes: fallbackBytes - sourceBytes,
          ratio: sourceBytes > 0 ? fallbackBytes / sourceBytes : null,
          cli: optimized
        }
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
        prompt: { type: "string", maxLength: 2000 },
        budget: { type: "object" }
      },
      required: ["prompt"],
      additionalProperties: false
    },
    async execute(context, input) {
      const prompt = String(input.prompt ?? "");
      const manifest = {
        prompt,
        target: "game_ready_glb",
        excluded: ["3D-Agent"],
        requiredQc: ["triangle_budget", "origin", "scale", "normals", "textures", "export_success"],
        bridge: "external_blender_required",
        safeScript: "blender/create_game_asset_safe.py"
      };
      const artifact = await context.artifactStore.writeJson("blender/create_game_asset_job.json", manifest);
      const script = await context.artifactStore.writeText(
        "blender/create_game_asset_safe.py",
        safeBlenderAssetScript(prompt)
      );
      const queued = await enqueueBlenderBridgeCommand("run_safe_script", {
        ...manifest,
        scriptPath: script
      });
      return {
        ok: true,
        message: "Game asset job manifest and safe Blender bridge command written",
        artifacts: [artifact, script, queued.path],
        data: { manifest, command: queued.command }
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
      properties: { prompt: { type: "string", maxLength: 2000 } },
      required: ["prompt"],
      additionalProperties: false
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
  },
  {
    name: "blender.repair_basic_asset",
    description: "Run a template-based Blender repair pass for scale, normals, triangulation, and GLB export.",
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
      const repairedTarget = artifactName(path, "_repaired.glb");
      const repaired = `${context.artifactStore.root}/${repairedTarget}`;
      const scriptText = repairBasicAssetScript(path, repaired);
      const script = await context.artifactStore.writeText(artifactName(path, "_repair_basic.py"), scriptText);
      const run = await runHeadlessBlenderScript(scriptText);
      if (!run.available || run.error) {
        return {
          ok: false,
          message: "Basic repair script written; headless Blender repair was not completed",
          artifacts: [script],
          data: { blender: run }
        };
      }
      if (!existsSync(repaired)) {
        return {
          ok: false,
          message: "Basic repair script ran but did not produce a repaired GLB",
          artifacts: [script],
          data: { blender: run, expectedOutput: repaired }
        };
      }
      const report = await inspectAndReport(repaired, typeof input.maxTriangles === "number" ? input.maxTriangles : 50000);
      const qc = await context.artifactStore.writeJson(artifactName(path, "_repaired_qc.json"), report);
      return {
        ok: report.summary.status !== "fail",
        message: `Basic Blender repair completed: ${report.summary.status}`,
        artifacts: [script, repaired, qc],
        data: { blender: run, qc: report }
      };
    }
  }
];

function safeBlenderAssetScript(prompt: string): string {
  const name = prompt
    .replace(/[^a-z0-9]+/giu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 48) || "CreativePipelineAsset";
  return `import bpy

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
bpy.ops.mesh.primitive_cube_add(size=1)
asset = bpy.context.object
asset.name = ${JSON.stringify(name)}
asset.location = (0, 0, 0)

mat = bpy.data.materials.new(name=${JSON.stringify(`${name}_Material`)})
mat.use_nodes = True
asset.data.materials.append(mat)

bpy.ops.export_scene.gltf(filepath=${JSON.stringify(`${name}.glb`)}, export_format="GLB")
`;
}

function repairBasicAssetScript(source: string, target: string): string {
  return `import bpy

source = ${JSON.stringify(source)}
target = ${JSON.stringify(target)}

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

if source.lower().endswith((".glb", ".gltf")):
    bpy.ops.import_scene.gltf(filepath=source)
else:
    raise RuntimeError("repair_basic_asset supports .glb and .gltf inputs")

for obj in list(bpy.context.scene.objects):
    if obj.type != "MESH":
        continue
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    try:
        bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    except Exception:
        pass
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    modifier = obj.modifiers.new(name="CreativePipelineTriangulate", type="TRIANGULATE")
    bpy.ops.object.modifier_apply(modifier=modifier.name)

bpy.ops.export_scene.gltf(filepath=target, export_format="GLB")
`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBlenderBridgeCommandType(
  value: unknown
): value is "create_scene" | "create_asset" | "modify_asset" | "apply_material" | "run_safe_script" {
  return value === "create_scene"
    || value === "create_asset"
    || value === "modify_asset"
    || value === "apply_material"
    || value === "run_safe_script";
}
