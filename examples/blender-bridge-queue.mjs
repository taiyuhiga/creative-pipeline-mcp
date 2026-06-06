import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const queueDir = resolve(root, "artifacts", "examples", "blender-bridge", "queue");
const statusDir = resolve(root, "artifacts", "examples", "blender-bridge", "status");
mkdirSync(queueDir, { recursive: true });
mkdirSync(statusDir, { recursive: true });

callTool("blender.create_asset", { prompt: "low-poly bridge sample" }, {
  CREATIVE_MCP_BLENDER_IPC_DIR: queueDir,
  CREATIVE_MCP_BLENDER_STATUS_DIR: statusDir
});
callTool("blender.read_bridge_status", {}, {
  CREATIVE_MCP_BLENDER_IPC_DIR: queueDir,
  CREATIVE_MCP_BLENDER_STATUS_DIR: statusDir
});

function callTool(name, args, extraEnv = {}) {
  const request = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args }
  });
  const result = spawnSync("node", ["packages/blender-pro-mcp/dist/server.js"], {
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
  if (!response.result?.structuredContent?.ok && name !== "blender.read_bridge_status") {
    throw new Error(`Tool returned not ok: ${name}`);
  }
  return response.result;
}
