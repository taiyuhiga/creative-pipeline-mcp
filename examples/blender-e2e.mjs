import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const artifacts = resolve(root, "artifacts", "examples", "blender-e2e");
const blenderBin = process.env.BLENDER_BIN ?? "blender";
mkdirSync(artifacts, { recursive: true });

const cubeScript = resolve(artifacts, "create-cube.py");
const cubePath = resolve(artifacts, "cube.glb");
writeFileSync(
  cubeScript,
  `
import bpy
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
bpy.ops.mesh.primitive_cube_add(size=1)
bpy.context.object.name = "CreativePipelineCube"
bpy.ops.export_scene.gltf(filepath=${JSON.stringify(cubePath)}, export_format='GLB')
`,
  "utf8"
);

run(blenderBin, ["--background", "--factory-startup", "--python", cubeScript]);
callTool("blender.render_preview", { path: cubePath });
callTool("blender.optimize_asset", { path: cubePath });
callTool("blender.validate_asset", { path: cubePath, maxTriangles: 1000 });

function callTool(name, args) {
  const request = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args }
  });
  const result = spawnSync("node", ["packages/blender-pro-mcp/dist/server.js"], {
    cwd: root,
    input: `${request}\n`,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `Tool failed: ${name}`);
  }
  process.stdout.write(result.stdout);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `${command} failed`);
  }
}
