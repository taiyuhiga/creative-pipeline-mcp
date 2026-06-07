import { existsSync, statSync } from "node:fs";
import { basename, join, parse } from "node:path";
import type { ToolDefinition, ToolExecutionContext } from "@creative-pipeline-mcp/core";
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
        maxTriangles: { type: "number" },
        maxDimension: { type: "number" }
      },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requirePath(input);
      await context.artifactStore.assertReadableFile(path);
      const maxTriangles = typeof input.maxTriangles === "number" ? input.maxTriangles : 50000;
      const maxDimension = typeof input.maxDimension === "number" ? input.maxDimension : undefined;
      const report = await inspectAndReport(path, maxTriangles, maxDimension);
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
        template: {
          type: "string",
          enum: ["auto", "lowpoly_crate", "sci_fi_door", "product_turntable_scene"]
        },
        budget: { type: "object" }
      },
      required: ["prompt"],
      additionalProperties: false
    },
    async execute(context, input) {
      const prompt = String(input.prompt ?? "");
      const template = selectGameAssetTemplate(prompt, input.template);
      const name = assetName(prompt, template);
      const outputTarget = `blender/${name}.glb`;
      const outputPath = join(context.artifactStore.root, outputTarget);
      const maxTriangles = readBudgetNumber(input.budget, "maxTriangles", 50000);
      const maxDimension = readBudgetNumber(input.budget, "maxDimension", undefined);
      const manifest = {
        prompt,
        template,
        target: "game_ready_glb",
        outputs: [
          outputTarget,
          `blender/${name}_preview.png`,
          `blender/${name}_optimized.glb`,
          `blender/${name}_asset_qc_report.json`
        ],
        excluded: ["3D-Agent"],
        requiredQc: ["triangle_budget", "origin", "scale", "normals", "textures", "materials", "naming", "bounds", "export_success"],
        bridge: "external_blender_required",
        safeScript: "blender/create_game_asset_safe.py"
      };
      const artifact = await context.artifactStore.writeJson("blender/create_game_asset_job.json", manifest);
      const scriptText = safeBlenderAssetScript(prompt, template, outputPath);
      const script = await context.artifactStore.writeText(
        "blender/create_game_asset_safe.py",
        scriptText
      );
      const run = await runHeadlessBlenderScript(scriptText);
      if (run.available && !run.error && existsSync(outputPath)) {
        const qcReport = await inspectAndReport(outputPath, maxTriangles, maxDimension);
        const qc = await context.artifactStore.writeJson(artifactName(outputPath, "_asset_qc_report.json"), qcReport);
        const preview = await renderPreviewArtifact(context, outputPath);
        const optimized = await optimizeGeneratedAsset(context, outputPath);
        return {
          ok: qcReport.summary.status !== "fail",
          message: `Game asset generated locally from ${template}: ${qcReport.summary.status}`,
          artifacts: [artifact, script, outputPath, qc, preview.artifact, optimized.artifact],
          data: {
            manifest,
            blender: run,
            qc: qcReport,
            preview: preview.data,
            optimize: optimized.data
          }
        };
      }
      const queued = await enqueueBlenderBridgeCommand("run_safe_script", {
        ...manifest,
        scriptPath: script
      });
      return {
        ok: true,
        message: "Game asset job manifest and safe Blender bridge command written; local headless Blender unavailable",
        artifacts: [artifact, script, queued.path],
        data: { manifest, command: queued.command, blender: run }
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

type GameAssetTemplate = "lowpoly_crate" | "sci_fi_door" | "product_turntable_scene";

function selectGameAssetTemplate(prompt: string, requested: unknown): GameAssetTemplate {
  if (requested === "lowpoly_crate" || requested === "sci_fi_door" || requested === "product_turntable_scene") {
    return requested;
  }
  const normalized = prompt.toLowerCase();
  if (normalized.includes("door") || normalized.includes("sci") || normalized.includes("sci-fi")) {
    return "sci_fi_door";
  }
  if (normalized.includes("turntable") || normalized.includes("product") || normalized.includes("display")) {
    return "product_turntable_scene";
  }
  return "lowpoly_crate";
}

function assetName(prompt: string, template: GameAssetTemplate): string {
  const slug = prompt
    .replace(/[^a-z0-9]+/giu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 40);
  return slug || template;
}

function readBudgetNumber(budget: unknown, key: string, fallback: number): number;
function readBudgetNumber(budget: unknown, key: string, fallback: undefined): number | undefined;
function readBudgetNumber(budget: unknown, key: string, fallback: number | undefined): number | undefined {
  if (!budget || typeof budget !== "object") {
    return fallback;
  }
  const value = (budget as Record<string, unknown>)[key];
  return typeof value === "number" ? value : fallback;
}

async function renderPreviewArtifact(context: ToolExecutionContext, source: string) {
  const artifact = await context.artifactStore.writeBytes(artifactName(source, "_preview.png"), placeholderPng());
  const render = await renderWithHeadlessBlender(source, artifact);
  return {
    artifact,
    data: render.available && !render.error
      ? { renderer: "blender_headless", command: render.command }
      : { renderer: "placeholder", blender: render }
  };
}

async function optimizeGeneratedAsset(context: ToolExecutionContext, source: string) {
  const target = artifactName(source, "_optimized.glb");
  const artifact = await context.artifactStore.writeBytes(target, new Uint8Array());
  const optimized = await optimizeWithCli(source, artifact);
  const sourceBytes = statSync(source).size;
  if (optimized.available && !optimized.error) {
    const optimizedBytes = statSync(artifact).size;
    return {
      artifact,
      data: {
        optimizer: optimized.command,
        source,
        sourceBytes,
        optimizedBytes,
        deltaBytes: optimizedBytes - sourceBytes,
        ratio: sourceBytes > 0 ? optimizedBytes / sourceBytes : null
      }
    };
  }
  const fallback = await context.artifactStore.copyIn(source, target);
  const fallbackBytes = statSync(fallback).size;
  return {
    artifact: fallback,
    data: {
      optimizer: "copy_fallback",
      source,
      sourceBytes,
      optimizedBytes: fallbackBytes,
      deltaBytes: fallbackBytes - sourceBytes,
      ratio: sourceBytes > 0 ? fallbackBytes / sourceBytes : null,
      cli: optimized
    }
  };
}

function safeBlenderAssetScript(prompt: string, template: GameAssetTemplate, outputPath: string): string {
  const name = assetName(prompt, template);
  const body = template === "sci_fi_door"
    ? sciFiDoorScriptBody()
    : template === "product_turntable_scene"
      ? productTurntableScriptBody()
      : lowpolyCrateScriptBody();
  return `import bpy

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

def material(name, color, metallic=0.0, roughness=0.65):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get("Principled BSDF")
    if node:
        if "Base Color" in node.inputs:
            node.inputs["Base Color"].default_value = color
        if "Metallic" in node.inputs:
            node.inputs["Metallic"].default_value = metallic
        if "Roughness" in node.inputs:
            node.inputs["Roughness"].default_value = roughness
    return mat

def cube(name, location, scale, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    return obj

asset_name = ${JSON.stringify(name)}
${body}

bpy.ops.export_scene.gltf(filepath=${JSON.stringify(outputPath)}, export_format="GLB")
`;
}

function lowpolyCrateScriptBody(): string {
  return `wood = material(asset_name + "_Wood_PBR", (0.58, 0.35, 0.16, 1.0), 0.0, 0.72)
trim = material(asset_name + "_DarkTrim_PBR", (0.18, 0.12, 0.08, 1.0), 0.0, 0.55)
cube("CrateBody", (0, 0, 0), (1.0, 1.0, 1.0), wood)
cube("CrateBand_Front", (0, -0.53, 0), (1.1, 0.06, 0.18), trim)
cube("CrateBand_Back", (0, 0.53, 0), (1.1, 0.06, 0.18), trim)
cube("CrateBand_Left", (-0.53, 0, 0), (0.06, 1.1, 0.18), trim)
cube("CrateBand_Right", (0.53, 0, 0), (0.06, 1.1, 0.18), trim)
cube("CrateBrace_Diagonal", (0, -0.56, 0), (1.25, 0.04, 0.08), trim).rotation_euler[1] = 0.65
`;
}

function sciFiDoorScriptBody(): string {
  return `metal = material(asset_name + "_Gunmetal_PBR", (0.19, 0.21, 0.24, 1.0), 0.65, 0.34)
panel = material(asset_name + "_Panel_PBR", (0.08, 0.10, 0.12, 1.0), 0.35, 0.42)
light = material(asset_name + "_CyanLight_PBR", (0.0, 0.75, 1.0, 1.0), 0.0, 0.18)
cube("DoorFrame_L", (-1.15, 0, 0), (0.16, 0.08, 1.45), metal)
cube("DoorFrame_R", (1.15, 0, 0), (0.16, 0.08, 1.45), metal)
cube("DoorFrame_Top", (0, 0, 1.35), (1.3, 0.08, 0.16), metal)
cube("DoorPanel_L", (-0.43, 0, 0), (0.48, 0.06, 1.15), panel)
cube("DoorPanel_R", (0.43, 0, 0), (0.48, 0.06, 1.15), panel)
cube("DoorLight_Center", (0, -0.08, 0.25), (0.06, 0.035, 0.95), light)
cube("DoorConsole_R", (1.42, -0.04, -0.15), (0.18, 0.05, 0.32), metal)
`;
}

function productTurntableScriptBody(): string {
  return `base = material(asset_name + "_Base_PBR", (0.12, 0.12, 0.12, 1.0), 0.4, 0.28)
product = material(asset_name + "_Product_PBR", (0.88, 0.66, 0.22, 1.0), 0.2, 0.38)
accent = material(asset_name + "_Accent_PBR", (0.04, 0.32, 0.75, 1.0), 0.0, 0.25)
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=1.1, depth=0.18, location=(0, 0, -0.1))
turntable = bpy.context.object
turntable.name = "DisplayBase"
turntable.data.materials.append(base)
cube("Product_Block", (0, 0, 0.45), (0.55, 0.42, 0.55), product)
cube("Product_Accent", (0, -0.43, 0.48), (0.38, 0.035, 0.12), accent)
bpy.ops.object.light_add(type="AREA", location=(0, -3, 3))
bpy.context.object.name = "KeyLight"
bpy.context.object.data.energy = 350
bpy.ops.object.camera_add(location=(2.3, -3.2, 1.7), rotation=(1.12, 0, 0.62))
bpy.context.object.name = "TurntableCamera"
bpy.context.scene.camera = bpy.context.object
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
