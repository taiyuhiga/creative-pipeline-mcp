import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const mediaDir = resolve(root, "artifacts", "examples", "premiere-project-delivery");
const queueDir = resolve(root, "artifacts", "examples", "premiere-project-delivery", "cep_queue");
mkdirSync(mediaDir, { recursive: true });
mkdirSync(queueDir, { recursive: true });

const mediaPath = join(mediaDir, "source.mp4");
writeFileSync(mediaPath, new Uint8Array([0]));

callTool("premiere.build_project_delivery", {
  path: mediaPath,
  template: "youtube_16x9",
  sequenceName: "Creative Pipeline Project Delivery",
  targetDuration: 30,
  brand: {
    primaryColor: "#1f6feb",
    fontFamily: "Inter",
    titleStyle: "clean_lower_third"
  },
  outputPath: join(mediaDir, "final.mp4")
}, {
  CREATIVE_MCP_PERMISSION: "project_write",
  CREATIVE_MCP_PREMIERE_IPC_DIR: queueDir,
  CREATIVE_MCP_WORKSPACE_ROOTS: root
});

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
  if (!response.result?.structuredContent?.ok) {
    throw new Error(`Tool returned not ok: ${name}`);
  }
  return response.result;
}
