import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { ApprovalPolicy, ArtifactStore, defaultLicenseManifest, McpServer } from "../packages/core/dist/index.js";
import { blenderTools } from "../packages/blender-pro-mcp/dist/index.js";
import { premiereTools } from "../packages/premiere-pro-mcp/dist/index.js";
import { directorTools } from "../packages/director-agent/dist/index.js";

async function context() {
  const root = await mkdtemp(join(tmpdir(), "creative-mcp-"));
  return {
    artifactStore: new ArtifactStore(root),
    approvalPolicy: new ApprovalPolicy("project_write"),
    licenseManifest: defaultLicenseManifest(),
    logger: { log() {} }
  };
}

test("MCP server lists tools", async () => {
  const server = new McpServer("test", "1.0.0", blenderTools);
  const result = await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  assert.ok(result.tools.some((tool) => tool.name === "blender.validate_asset"));
});

test("Blender asset QC writes a report", async () => {
  const tool = blenderTools.find((candidate) => candidate.name === "blender.validate_asset");
  assert.ok(tool);
  const result = await tool.execute(await context(), {
    path: resolve("examples/minimal.gltf"),
    maxTriangles: 10
  });
  assert.equal(result.ok, true);
  assert.equal(result.artifacts.length, 1);
});

test("Premiere rough cut writes an OTIO plan even when ffprobe cannot parse the placeholder media", async () => {
  const mediaPath = join(await mkdtemp(join(tmpdir(), "creative-mcp-media-")), "placeholder.mp4");
  await writeFile(mediaPath, new Uint8Array([0]));
  const tool = premiereTools.find((candidate) => candidate.name === "premiere.make_rough_cut");
  assert.ok(tool);
  const result = await tool.execute(await context(), {
    path: mediaPath,
    brief: "short social cut",
    targetDuration: 15
  });
  assert.equal(result.ok, true);
  assert.equal(result.artifacts.length, 1);
});

test("Director agent writes a production plan", async () => {
  const tool = directorTools.find((candidate) => candidate.name === "director.plan_production");
  assert.ok(tool);
  const result = await tool.execute(await context(), { brief: "product launch video" });
  assert.equal(result.ok, true);
  assert.equal(result.artifacts.length, 1);
});

