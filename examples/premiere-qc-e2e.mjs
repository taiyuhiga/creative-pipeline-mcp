import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const artifacts = resolve(root, "artifacts", "examples", "premiere-e2e");
mkdirSync(artifacts, { recursive: true });

const source = resolve(artifacts, "source.mp4");
run("ffmpeg", [
  "-hide_banner",
  "-y",
  "-f",
  "lavfi",
  "-i",
  "testsrc=duration=1:size=320x240:rate=30",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=880:duration=1",
  "-shortest",
  source
]);

const roughCut = callTool("premiere.make_rough_cut", {
  path: source,
  brief: "One-second generated QC sample",
  targetDuration: 1
});
callTool("premiere.run_delivery_qc", {
  path: source,
  targetWidth: 320,
  targetHeight: 240,
  maxDuration: 2,
  referencePath: source,
  targetMinVmaf: 99
});
callTool("premiere.generate_thumbnail_plan", { path: source, count: 1 });

const otioPath = roughCut.structuredContent.artifacts[0];
callTool(
  "premiere.build_timeline_from_otio",
  { otioPath, sequenceName: "Creative Pipeline E2E" },
  { CREATIVE_MCP_PERMISSION: "project_write" }
);
callTool("premiere.read_cep_status", {});

function callTool(name, args, extraEnv = {}) {
  const request = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args }
  });
  const result = spawnSync("node", ["packages/premiere-pro-mcp/dist/server.js"], {
    cwd: root,
    input: `${request}\n`,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv }
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `Tool failed: ${name}`);
  }
  process.stdout.write(result.stdout);
  const response = JSON.parse(result.stdout);
  if (!response.result?.structuredContent?.ok && name !== "premiere.read_cep_status") {
    throw new Error(`Tool returned not ok: ${name}`);
  }
  return response.result;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `${command} failed`);
  }
}
