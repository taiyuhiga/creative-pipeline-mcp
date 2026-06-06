import { access, mkdtemp, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  if (command.includes("/") || command.includes("\\")) {
    try {
      await access(command, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await execFileAsync(process.platform === "win32" ? "where" : "command", process.platform === "win32" ? [command] : ["-v", command], {
      shell: process.platform !== "win32"
    });
    return true;
  } catch {
    return false;
  }
}

export async function optimizeWithCli(source: string, target: string): Promise<CliResult> {
  const gltfTransform = process.env.GLTF_TRANSFORM_BIN ?? "gltf-transform";
  if (await commandExists(gltfTransform)) {
    try {
      const { stdout, stderr } = await execFileAsync(gltfTransform, ["optimize", source, target]);
      return { available: true, command: gltfTransform, stdout, stderr };
    } catch (error) {
      return { available: true, command: gltfTransform, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const gltfpack = process.env.GLTFPACK_BIN ?? "gltfpack";
  if (await commandExists(gltfpack)) {
    try {
      const { stdout, stderr } = await execFileAsync(gltfpack, ["-i", source, "-o", target]);
      return { available: true, command: gltfpack, stdout, stderr };
    } catch (error) {
      return { available: true, command: gltfpack, error: error instanceof Error ? error.message : String(error) };
    }
  }

  return { available: false, command: "gltf-transform|gltfpack", error: "No glTF optimizer CLI found" };
}

export async function renderWithHeadlessBlender(source: string, outputPng: string): Promise<CliResult> {
  const blender = process.env.BLENDER_BIN ?? "blender";
  if (!(await commandExists(blender))) {
    return { available: false, command: blender, error: "Blender executable not found" };
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
    const { stdout, stderr } = await execFileAsync(blender, ["--background", source.endsWith(".blend") ? source : "--factory-startup", "--python", scriptPath]);
    return { available: true, command: blender, stdout, stderr };
  } catch (error) {
    return { available: true, command: blender, error: error instanceof Error ? error.message : String(error) };
  }
}

