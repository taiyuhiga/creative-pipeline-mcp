#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";

const schema = "creative.pipeline.blender.status.v1";
const commandTypes = new Set(["create_scene", "create_asset", "modify_asset", "apply_material", "run_safe_script"]);

const options = parseArgs(process.argv.slice(2));
mkdirSync(options.queueDir, { recursive: true });
mkdirSync(options.statusDir, { recursive: true });
mkdirSync(options.archiveDir, { recursive: true });

let totalProcessed = 0;
do {
  const processed = processBatch(options);
  totalProcessed += processed;
  if (options.once || totalProcessed >= options.maxCommands) {
    break;
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, options.pollMs);
} while (true);

console.log(JSON.stringify({
  ok: true,
  processed: totalProcessed,
  queueDir: options.queueDir,
  statusDir: options.statusDir,
  dryRun: options.dryRun
}, null, 2));

function processBatch(workerOptions) {
  const files = readdirSync(workerOptions.queueDir)
    .filter((file) => file.endsWith(".json"))
    .sort();
  let processed = 0;
  for (const file of files) {
    if (processed >= workerOptions.maxCommands) {
      break;
    }
    const path = join(workerOptions.queueDir, file);
    let command;
    try {
      command = readCommand(path);
      writeStatus(workerOptions, command, {
        status: "accepted",
        message: "Blender bridge command accepted",
        details: {}
      });
      const result = executeCommand(workerOptions, command);
      writeStatus(workerOptions, command, result);
    } catch (error) {
      const fallback = {
        id: file.replace(/\.json$/, ""),
        type: "unknown",
        payload: {},
        createdAt: new Date().toISOString()
      };
      writeStatus(workerOptions, command ?? fallback, {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        details: {}
      });
    }
    renameSync(path, join(workerOptions.archiveDir, file));
    processed += 1;
  }
  return processed;
}

function readCommand(path) {
  const command = JSON.parse(readFileSync(path, "utf8"));
  if (!command || typeof command !== "object") {
    throw new Error("Blender bridge command must be a JSON object");
  }
  if (typeof command.id !== "string" || command.id.length === 0) {
    throw new Error("Blender bridge command is missing id");
  }
  if (typeof command.type !== "string" || !commandTypes.has(command.type)) {
    throw new Error(`Unsupported Blender bridge command type: ${String(command.type)}`);
  }
  if (!command.payload || typeof command.payload !== "object") {
    throw new Error("Blender bridge command payload must be an object");
  }
  return command;
}

function executeCommand(workerOptions, command) {
  if (workerOptions.dryRun) {
    return {
      status: "success",
      message: `Dry-run processed ${command.type}`,
      details: { dryRun: true }
    };
  }

  if (command.type === "run_safe_script") {
    const scriptPath = assertAllowedReadablePath(command.payload.scriptPath, "scriptPath");
    return runBlender(workerOptions, ["--background", "--factory-startup", "--python", scriptPath], {
      scriptPath
    });
  }

  const scriptPath = writeGeneratedScript(workerOptions, command);
  return runBlender(workerOptions, ["--background", "--factory-startup", "--python", scriptPath], {
    scriptPath,
    outputPath: outputPathFor(workerOptions, command)
  });
}

function runBlender(workerOptions, args, details) {
  const result = spawnSync(workerOptions.blenderBin, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  const failed = result.status !== 0
    || /\bTraceback \(most recent call last\):/.test(result.stderr ?? "")
    || (typeof details.outputPath === "string" && !existsSync(details.outputPath));
  if (failed) {
    return {
      status: "error",
      message: `Blender command failed: ${workerOptions.blenderBin}`,
      details: {
        ...details,
        command: workerOptions.blenderBin,
        args,
        status: result.status,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error?.message,
        outputExists: typeof details.outputPath === "string" ? existsSync(details.outputPath) : undefined
      }
    };
  }
  return {
    status: "success",
    message: "Blender command completed",
    details: {
      ...details,
      command: workerOptions.blenderBin,
      args,
      stdout: result.stdout,
      stderr: result.stderr
    }
  };
}

function writeGeneratedScript(workerOptions, command) {
  const scriptDir = join(workerOptions.statusDir, "generated_scripts");
  mkdirSync(scriptDir, { recursive: true });
  const scriptPath = join(scriptDir, `${command.id}.py`);
  const outputPath = outputPathFor(workerOptions, command);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(scriptPath, generatedBlenderScript(command, outputPath), "utf8");
  return scriptPath;
}

function generatedBlenderScript(command, outputPath) {
  if (command.type === "modify_asset" || command.type === "apply_material") {
    const source = assertAllowedReadablePath(command.payload.source, "source");
    return `
import bpy

source = ${JSON.stringify(source)}
output = ${JSON.stringify(outputPath)}

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
if source.lower().endswith((".glb", ".gltf")):
    bpy.ops.import_scene.gltf(filepath=source)
elif source.lower().endswith(".blend"):
    bpy.ops.wm.open_mainfile(filepath=source)
else:
    raise RuntimeError("Unsupported Blender bridge source: " + source)

if ${JSON.stringify(command.type)} == "apply_material":
    mat = bpy.data.materials.new("CreativePipelineMaterial")
    mat.diffuse_color = (0.2, 0.45, 0.9, 1.0)
    for obj in bpy.context.scene.objects:
        if hasattr(obj.data, "materials"):
            obj.data.materials.append(mat)

bpy.ops.export_scene.gltf(filepath=output, export_format="GLB")
`;
  }

  const prompt = typeof command.payload.prompt === "string" ? command.payload.prompt : command.type;
  const createPlane = command.type === "create_scene" ? "True" : "False";
  return `
import bpy
import math

output = ${JSON.stringify(outputPath)}
prompt = ${JSON.stringify(prompt.slice(0, 120))}

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

if ${createPlane}:
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
    bpy.context.object.name = "CreativePipelineGround"

bpy.ops.mesh.primitive_cube_add(size=1.8, location=(0, 0, 1))
bpy.context.object.name = "CreativePipelineAsset_" + prompt[:32].replace(" ", "_")

bpy.ops.object.light_add(type="AREA", location=(2, -3, 5))
bpy.context.object.data.energy = 450
bpy.context.object.data.size = 4
bpy.ops.object.camera_add(location=(3.5, -5, 3), rotation=(math.radians(60), 0, math.radians(35)))
bpy.context.scene.camera = bpy.context.object

bpy.ops.export_scene.gltf(filepath=output, export_format="GLB")
`;
}

function outputPathFor(workerOptions, command) {
  if (typeof command.payload.outputPath === "string" && command.payload.outputPath.length > 0) {
    return resolve(command.payload.outputPath);
  }
  const suffix = command.type === "create_scene" ? "scene" : "asset";
  return join(workerOptions.outputDir, `${command.id}-${suffix}.glb`);
}

function writeStatus(workerOptions, command, result) {
  const now = new Date().toISOString();
  const status = {
    schema,
    commandId: typeof command.id === "string" ? command.id : null,
    commandType: commandTypes.has(command.type) ? command.type : "unknown",
    status: result.status,
    message: result.message,
    details: result.details ?? {},
    command,
    processedAt: now,
    finishedAt: result.status === "accepted" ? undefined : now
  };
  writeFileSync(join(workerOptions.statusDir, `${status.commandId ?? "unknown"}.json`), `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

function assertAllowedReadablePath(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing ${label}`);
  }
  const path = resolve(value);
  if (!existsSync(path)) {
    throw new Error(`${label} does not exist: ${path}`);
  }
  const roots = allowedRoots();
  if (roots.length > 0) {
    const realPath = realpathSync(path);
    const inside = roots.some((root) => {
      const rel = relative(root, realPath);
      return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
    });
    if (!inside) {
      throw new Error(`${label} is outside CREATIVE_MCP_WORKSPACE_ROOTS: ${path}`);
    }
  }
  return path;
}

function allowedRoots() {
  return (process.env.CREATIVE_MCP_WORKSPACE_ROOTS ?? process.cwd())
    .split(delimiter)
    .filter(Boolean)
    .map((root) => realpathSync(resolve(root)));
}

function parseArgs(args) {
  const parsed = {
    queueDir: resolve(process.env.CREATIVE_MCP_BLENDER_IPC_DIR ?? "artifacts/blender/bridge_queue"),
    statusDir: resolve(process.env.CREATIVE_MCP_BLENDER_STATUS_DIR ?? "artifacts/blender/bridge_status"),
    outputDir: resolve(process.env.CREATIVE_MCP_BLENDER_OUTPUT_DIR ?? "artifacts/blender/bridge_outputs"),
    archiveDir: "",
    blenderBin: process.env.BLENDER_BIN ?? "blender",
    once: false,
    dryRun: false,
    pollMs: 1000,
    maxCommands: Number.POSITIVE_INFINITY
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const [key, inlineValue] = arg.split("=", 2);
    const value = inlineValue ?? args[index + 1];
    if (inlineValue === undefined && ["--queue", "--status", "--output", "--archive", "--blender-bin", "--poll-ms", "--max-commands"].includes(key)) {
      index += 1;
    }
    if (key === "--queue") parsed.queueDir = resolve(value);
    else if (key === "--status") parsed.statusDir = resolve(value);
    else if (key === "--output") parsed.outputDir = resolve(value);
    else if (key === "--archive") parsed.archiveDir = resolve(value);
    else if (key === "--blender-bin") parsed.blenderBin = value;
    else if (key === "--poll-ms") parsed.pollMs = Math.max(100, Number(value) || 1000);
    else if (key === "--max-commands") parsed.maxCommands = Math.max(1, Number(value) || 1);
    else if (key === "--once") parsed.once = true;
    else if (key === "--dry-run") parsed.dryRun = true;
  }

  parsed.archiveDir ||= join(parsed.queueDir, "processed");
  return parsed;
}
