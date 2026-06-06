import { access, mkdtemp, writeFile } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CliResult {
  available: boolean;
  command: string;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export async function commandExists(command: string): Promise<boolean> {
  const resolved = resolveCommand(command);
  if (command.includes("/") || command.includes("\\")) {
    try {
      await access(command, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await execFileAsync(process.platform === "win32" ? "where" : "command", process.platform === "win32" ? [resolved] : ["-v", resolved], {
      shell: process.platform !== "win32"
    });
    return true;
  } catch {
    return false;
  }
}

export async function optimizeWithCli(source: string, target: string): Promise<CliResult> {
  const gltfTransform = process.env.GLTF_TRANSFORM_BIN ?? "gltf-transform";
  const gltfTransformCommand = resolveCommand(gltfTransform);
  if (await commandExists(gltfTransform)) {
    try {
      const { stdout, stderr } = await execFileAsync(gltfTransformCommand, ["optimize", source, target]);
      return { available: true, command: gltfTransformCommand, stdout, stderr };
    } catch (error) {
      return { available: true, command: gltfTransformCommand, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const gltfpack = process.env.GLTFPACK_BIN ?? "gltfpack";
  const gltfpackCommand = resolveCommand(gltfpack);
  if (await commandExists(gltfpack)) {
    try {
      const { stdout, stderr } = await execFileAsync(gltfpackCommand, ["-i", source, "-o", target]);
      return { available: true, command: gltfpackCommand, stdout, stderr };
    } catch (error) {
      return { available: true, command: gltfpackCommand, error: error instanceof Error ? error.message : String(error) };
    }
  }

  return { available: false, command: "gltf-transform|gltfpack", error: "No glTF optimizer CLI found" };
}

export async function renderWithHeadlessBlender(source: string, outputPng: string): Promise<CliResult> {
  const blender = process.env.BLENDER_BIN ?? "blender";
  const blenderCommand = resolveCommand(blender);
  if (!(await commandExists(blender))) {
    return { available: false, command: blenderCommand, error: "Blender executable not found" };
  }
  const tempDir = await mkdtemp(join(tmpdir(), "creative-mcp-blender-"));
  const scriptPath = join(tempDir, "render_preview.py");
  const script = `
import bpy
import os

source = ${JSON.stringify(source)}
output = ${JSON.stringify(outputPng)}

bpy.ops.object.delete()
if source.lower().endswith((".glb", ".gltf")):
    bpy.ops.import_scene.gltf(filepath=source)
elif source.lower().endswith(".blend"):
    pass
else:
    raise RuntimeError("Unsupported preview source: " + source)

if not bpy.context.scene.camera:
    bpy.ops.object.light_add(type="AREA", location=(2, -3, 4))
    bpy.context.object.data.energy = 400
    bpy.ops.object.camera_add(location=(3, -5, 3), rotation=(1.1, 0, 0.55))
    bpy.context.scene.camera = bpy.context.object

bpy.context.scene.render.resolution_x = 1024
bpy.context.scene.render.resolution_y = 1024
bpy.context.scene.render.filepath = output
bpy.ops.render.render(write_still=True)
`;
  await writeFile(scriptPath, script, "utf8");
  try {
    const { stdout, stderr } = await execFileAsync(blenderCommand, ["--background", source.endsWith(".blend") ? source : "--factory-startup", "--python", scriptPath]);
    return { available: true, command: blenderCommand, stdout, stderr };
  } catch (error) {
    return { available: true, command: blenderCommand, error: error instanceof Error ? error.message : String(error) };
  }
}

function resolveCommand(command: string): string {
  if (command.includes("/") || command.includes("\\")) {
    return command;
  }
  const local = resolve("node_modules", ".bin", process.platform === "win32" ? `${command}.cmd` : command);
  return existsSync(local) ? local : command;
}
