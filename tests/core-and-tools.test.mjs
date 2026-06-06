import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { ApprovalPolicy, ArtifactStore, defaultLicenseManifest, McpServer } from "../packages/core/dist/index.js";
import { blenderTools } from "../packages/blender-pro-mcp/dist/index.js";
import { premiereTools } from "../packages/premiere-pro-mcp/dist/index.js";
import { directorTools } from "../packages/director-agent/dist/index.js";

async function context(workspaceRoots = process.cwd()) {
  const root = await mkdtemp(join(tmpdir(), "creative-mcp-"));
  return {
    artifactStore: new ArtifactStore(root, workspaceRoots),
    approvalPolicy: new ApprovalPolicy("project_write"),
    licenseManifest: defaultLicenseManifest(),
    logger: { log() {} }
  };
}

test("MCP server lists tools", async () => {
  const server = new McpServer("test", "0.2.1-alpha.0", blenderTools);
  const result = await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  assert.ok(result.tools.some((tool) => tool.name === "blender.validate_asset"));
});

test("Premiere tool surface includes optional real adapter tools", async () => {
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.transcribe_media"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.detect_scenes"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.measure_loudness"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.build_timeline_from_otio"));
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

test("Blender game asset generation writes a safe script artifact", async () => {
  const tool = blenderTools.find((candidate) => candidate.name === "blender.create_game_asset");
  assert.ok(tool);
  const result = await tool.execute(await context(), {
    prompt: "low-poly prop crate"
  });
  assert.equal(result.ok, true);
  assert.equal(result.artifacts.length, 2);
  assert.ok(result.artifacts.some((artifact) => artifact.endsWith("create_game_asset_safe.py")));
  const scriptPath = result.artifacts.find((artifact) => artifact.endsWith("create_game_asset_safe.py"));
  const script = await readFile(scriptPath, "utf8");
  assert.match(script, /bpy\.ops\.export_scene\.gltf/);
});

test("Premiere rough cut writes an OTIO plan even when ffprobe cannot parse the placeholder media", async () => {
  const mediaRoot = await mkdtemp(join(tmpdir(), "creative-mcp-media-"));
  const mediaPath = join(mediaRoot, "placeholder.mp4");
  await writeFile(mediaPath, new Uint8Array([0]));
  const tool = premiereTools.find((candidate) => candidate.name === "premiere.make_rough_cut");
  assert.ok(tool);
  const result = await tool.execute(await context(mediaRoot), {
    path: mediaPath,
    brief: "short social cut",
    targetDuration: 15
  });
  assert.equal(result.ok, true);
  assert.equal(result.artifacts.length, 1);
});

test("Premiere export and brand tools queue CEP commands", async () => {
  const mediaRoot = await mkdtemp(join(tmpdir(), "creative-mcp-media-"));
  const mediaPath = join(mediaRoot, "placeholder.mp4");
  await writeFile(mediaPath, new Uint8Array([0]));
  const queueRoot = await mkdtemp(join(tmpdir(), "creative-mcp-queue-"));
  const previous = process.env.CREATIVE_MCP_PREMIERE_IPC_DIR;
  process.env.CREATIVE_MCP_PREMIERE_IPC_DIR = queueRoot;
  try {
    const exportTool = premiereTools.find((candidate) => candidate.name === "premiere.export_video");
    const brandTool = premiereTools.find((candidate) => candidate.name === "premiere.apply_brand_package");
    assert.ok(exportTool);
    assert.ok(brandTool);
    const exportResult = await exportTool.execute(await context(mediaRoot), {
      path: mediaPath,
      outputPath: join(mediaRoot, "final.mp4")
    });
    const brandResult = await brandTool.execute(await context(mediaRoot), {
      path: mediaPath,
      brand: { primaryColor: "#111111" }
    });
    assert.equal(exportResult.artifacts.length, 2);
    assert.equal(brandResult.artifacts.length, 2);
    const queueFiles = (await readdir(queueRoot)).filter((file) => file.endsWith(".json"));
    assert.equal(queueFiles.length, 2);
    const queuedTypes = await Promise.all(queueFiles.map(async (file) => JSON.parse(await readFile(join(queueRoot, file), "utf8")).type));
    assert.deepEqual(queuedTypes.sort(), ["apply_brand_package", "export_sequence"]);
  } finally {
    if (previous === undefined) {
      delete process.env.CREATIVE_MCP_PREMIERE_IPC_DIR;
    } else {
      process.env.CREATIVE_MCP_PREMIERE_IPC_DIR = previous;
    }
  }
});

test("Premiere optional adapter tool writes a manifest", async () => {
  const mediaRoot = await mkdtemp(join(tmpdir(), "creative-mcp-media-"));
  const mediaPath = join(mediaRoot, "placeholder.mp4");
  await writeFile(mediaPath, new Uint8Array([0]));
  const tool = premiereTools.find((candidate) => candidate.name === "premiere.transcribe_media");
  assert.ok(tool);
  const result = await tool.execute(await context(mediaRoot), { path: mediaPath });
  assert.equal(result.artifacts.length, 1);
  assert.match(result.message, /transcription|adapter manifest/i);
});

test("Premiere CEP status reader returns panel status records", async () => {
  const statusRoot = await mkdtemp(join(tmpdir(), "creative-mcp-status-"));
  const statusPath = join(statusRoot, "command.json");
  await mkdir(statusRoot, { recursive: true });
  await writeFile(statusPath, JSON.stringify({ result: "inserted 1 clips" }), "utf8");
  const previous = process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR;
  process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR = statusRoot;
  try {
    const tool = premiereTools.find((candidate) => candidate.name === "premiere.read_cep_status");
    assert.ok(tool);
    const result = await tool.execute(await context(statusRoot), {});
    assert.equal(result.ok, true);
    assert.equal(result.data.statuses.length, 1);
    assert.equal(result.data.statuses[0].status.schema, "creative.pipeline.premiere.status.v1");
    assert.equal(result.data.statuses[0].status.message, "legacy CEP status");
  } finally {
    if (previous === undefined) {
      delete process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR;
    } else {
      process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR = previous;
    }
  }
});

test("ArtifactStore blocks artifact path traversal", async () => {
  const store = new ArtifactStore(await mkdtemp(join(tmpdir(), "creative-mcp-artifacts-")));
  await assert.rejects(() => store.writeText("../outside.txt", "nope"), /Unsafe artifact path/);
});

test("ArtifactStore blocks input files outside workspace roots", async () => {
  const store = new ArtifactStore(await mkdtemp(join(tmpdir(), "creative-mcp-artifacts-")), process.cwd());
  const outside = join(await mkdtemp(join(tmpdir(), "creative-mcp-outside-")), "secret.txt");
  await writeFile(outside, "secret");
  await assert.rejects(() => store.assertReadableFile(outside), /outside CREATIVE_MCP_WORKSPACE_ROOTS/);
});

test("Router rejects invalid schema input before execution", async () => {
  const server = new McpServer("test", "0.2.1-alpha.0", blenderTools);
  const result = await server.handle({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "blender.validate_asset", arguments: { maxTriangles: 10 } }
  });
  assert.equal(result.structuredContent.ok, false);
  assert.match(result.structuredContent.message, /Invalid input/);
});

test("Router writes approval request for project_write tools", async () => {
  const server = new McpServer("test", "0.2.1-alpha.0", blenderTools);
  const result = await server.handle({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "blender.export_game_ready", arguments: { path: resolve("examples/minimal.gltf") } }
  });
  assert.equal(result.structuredContent.ok, false);
  assert.match(result.structuredContent.message, /Approval request written/);
  assert.equal(result.structuredContent.artifacts.length, 1);
});

test("Director agent writes a production plan", async () => {
  const tool = directorTools.find((candidate) => candidate.name === "director.plan_production");
  assert.ok(tool);
  const result = await tool.execute(await context(), { brief: "product launch video" });
  assert.equal(result.ok, true);
  assert.equal(result.artifacts.length, 1);
});
