import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
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
  const server = new McpServer("test", "0.2.10-alpha.0", blenderTools);
  const result = await server.handle({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  assert.ok(result.tools.some((tool) => tool.name === "blender.validate_asset"));
});

test("Premiere tool surface includes optional real adapter tools", async () => {
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.transcribe_media"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.detect_scenes"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.measure_loudness"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.build_timeline_from_otio"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.await_cep_status"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.finalize_export_qc"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.measure_vmaf"));
});

test("Blender asset QC writes a report", async () => {
  const tool = blenderTools.find((candidate) => candidate.name === "blender.validate_asset");
  assert.ok(tool);
  assert.ok(blenderTools.some((candidate) => candidate.name === "blender.repair_basic_asset"));
  assert.ok(blenderTools.some((candidate) => candidate.name === "blender.read_bridge_status"));
  assert.ok(blenderTools.some((candidate) => candidate.name === "blender.await_bridge_status"));
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
  const queueRoot = await mkdtemp(join(tmpdir(), "creative-mcp-blender-queue-"));
  const previous = process.env.CREATIVE_MCP_BLENDER_IPC_DIR;
  process.env.CREATIVE_MCP_BLENDER_IPC_DIR = queueRoot;
  try {
    const result = await tool.execute(await context(), {
      prompt: "low-poly prop crate"
    });
    assert.equal(result.ok, true);
    assert.equal(result.artifacts.length, 3);
    assert.ok(result.artifacts.some((artifact) => artifact.endsWith("create_game_asset_safe.py")));
    const scriptPath = result.artifacts.find((artifact) => artifact.endsWith("create_game_asset_safe.py"));
    const script = await readFile(scriptPath, "utf8");
    assert.match(script, /bpy\.ops\.export_scene\.gltf/);
    const queueFiles = (await readdir(queueRoot)).filter((file) => file.endsWith(".json"));
    assert.equal(queueFiles.length, 1);
    const queued = JSON.parse(await readFile(join(queueRoot, queueFiles[0]), "utf8"));
    assert.equal(queued.type, "run_safe_script");
    assert.equal(queued.payload.scriptPath, scriptPath);
  } finally {
    if (previous === undefined) {
      delete process.env.CREATIVE_MCP_BLENDER_IPC_DIR;
    } else {
      process.env.CREATIVE_MCP_BLENDER_IPC_DIR = previous;
    }
  }
});

test("Blender bridge status tools read and await bridge records", async () => {
  const statusRoot = await mkdtemp(join(tmpdir(), "creative-mcp-blender-status-"));
  await mkdir(statusRoot, { recursive: true });
  await writeFile(join(statusRoot, "cmd-1.json"), JSON.stringify({
    schema: "creative.pipeline.blender.status.v1",
    commandId: "cmd-1",
    commandType: "create_asset",
    status: "success",
    message: "asset created",
    details: { outputPath: "asset.glb" }
  }), "utf8");
  const previous = process.env.CREATIVE_MCP_BLENDER_STATUS_DIR;
  process.env.CREATIVE_MCP_BLENDER_STATUS_DIR = statusRoot;
  try {
    const readTool = blenderTools.find((candidate) => candidate.name === "blender.read_bridge_status");
    const awaitTool = blenderTools.find((candidate) => candidate.name === "blender.await_bridge_status");
    assert.ok(readTool);
    assert.ok(awaitTool);
    const readResult = await readTool.execute(await context(statusRoot), {});
    assert.equal(readResult.ok, true);
    assert.equal(readResult.data.statuses.length, 1);
    const awaitResult = await awaitTool.execute(await context(statusRoot), {
      commandId: "cmd-1",
      commandType: "create_asset",
      timeoutMs: 0
    });
    assert.equal(awaitResult.ok, true);
    assert.equal(awaitResult.data.status.commandId, "cmd-1");
  } finally {
    if (previous === undefined) {
      delete process.env.CREATIVE_MCP_BLENDER_STATUS_DIR;
    } else {
      process.env.CREATIVE_MCP_BLENDER_STATUS_DIR = previous;
    }
  }
});

test("Blender bridge worker drains queued commands and writes status", async () => {
  const queueRoot = await mkdtemp(join(tmpdir(), "creative-mcp-blender-worker-queue-"));
  const statusRoot = await mkdtemp(join(tmpdir(), "creative-mcp-blender-worker-status-"));
  const command = {
    id: "cmd-worker-1",
    type: "create_asset",
    payload: { prompt: "worker sample asset" },
    createdAt: new Date().toISOString()
  };
  await writeFile(join(queueRoot, `${command.id}.json`), JSON.stringify(command), "utf8");
  const result = spawnSync("node", [
    "scripts/blender-bridge-worker.mjs",
    "--once",
    "--dry-run",
    "--queue",
    queueRoot,
    "--status",
    statusRoot
  ], {
    cwd: resolve("."),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.processed, 1);
  const status = JSON.parse(await readFile(join(statusRoot, `${command.id}.json`), "utf8"));
  assert.equal(status.schema, "creative.pipeline.blender.status.v1");
  assert.equal(status.commandId, command.id);
  assert.equal(status.commandType, "create_asset");
  assert.equal(status.status, "success");
  assert.equal(status.details.dryRun, true);
  const remainingQueueFiles = (await readdir(queueRoot)).filter((file) => file.endsWith(".json"));
  assert.equal(remainingQueueFiles.length, 0);
  const archived = (await readdir(join(queueRoot, "processed"))).filter((file) => file.endsWith(".json"));
  assert.deepEqual(archived, [`${command.id}.json`]);
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

test("Premiere VMAF tool writes an adapter report when FFmpeg VMAF cannot run", async () => {
  const mediaRoot = await mkdtemp(join(tmpdir(), "creative-mcp-media-"));
  const mediaPath = join(mediaRoot, "placeholder.mp4");
  const referencePath = join(mediaRoot, "reference.mp4");
  await writeFile(mediaPath, new Uint8Array([0]));
  await writeFile(referencePath, new Uint8Array([0]));
  const tool = premiereTools.find((candidate) => candidate.name === "premiere.measure_vmaf");
  assert.ok(tool);
  const result = await tool.execute(await context(mediaRoot), {
    path: mediaPath,
    referencePath,
    targetMinVmaf: 90
  });
  assert.equal(result.ok, false);
  assert.equal(result.artifacts.length, 1);
  const report = JSON.parse(await readFile(result.artifacts[0], "utf8"));
  assert.equal(report.source, mediaPath);
  assert.equal(report.reference, referencePath);
  assert.equal(report.targetMinVmaf, 90);
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

test("Premiere CEP status awaiter resolves matching export status", async () => {
  const statusRoot = await mkdtemp(join(tmpdir(), "creative-mcp-status-"));
  const statusPath = join(statusRoot, "cmd-1.json");
  await mkdir(statusRoot, { recursive: true });
  await writeFile(statusPath, JSON.stringify({
    schema: "creative.pipeline.premiere.status.v1",
    commandId: "cmd-1",
    commandType: "export_sequence",
    status: "success",
    message: "export queued",
    details: { outputPath: join(statusRoot, "missing-final.mp4") }
  }), "utf8");
  const previous = process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR;
  process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR = statusRoot;
  try {
    const tool = premiereTools.find((candidate) => candidate.name === "premiere.await_cep_status");
    assert.ok(tool);
    const result = await tool.execute(await context(statusRoot), {
      commandId: "cmd-1",
      commandType: "export_sequence",
      timeoutMs: 0
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.status.commandId, "cmd-1");
  } finally {
    if (previous === undefined) {
      delete process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR;
    } else {
      process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR = previous;
    }
  }
});

test("Premiere export QC finalizer writes a pending artifact while output is missing", async () => {
  const statusRoot = await mkdtemp(join(tmpdir(), "creative-mcp-status-"));
  const outputPath = join(statusRoot, "missing-final.mp4");
  const statusPath = join(statusRoot, "cmd-2.json");
  await mkdir(statusRoot, { recursive: true });
  await writeFile(statusPath, JSON.stringify({
    schema: "creative.pipeline.premiere.status.v1",
    commandId: "cmd-2",
    commandType: "export_sequence",
    status: "success",
    message: "export complete",
    details: { outputPath }
  }), "utf8");
  const previous = process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR;
  process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR = statusRoot;
  try {
    const tool = premiereTools.find((candidate) => candidate.name === "premiere.finalize_export_qc");
    assert.ok(tool);
    const result = await tool.execute(await context(statusRoot), { commandId: "cmd-2" });
    assert.equal(result.ok, false);
    assert.match(result.message, /pending/i);
    assert.equal(result.artifacts.length, 1);
    const pending = JSON.parse(await readFile(result.artifacts[0], "utf8"));
    assert.equal(pending.reason, "output_file_not_found");
    assert.equal(pending.outputPath, outputPath);
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

test("ArtifactStore blocks symlinks that resolve outside workspace roots by default", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "creative-mcp-workspace-"));
  const outside = await mkdtemp(join(tmpdir(), "creative-mcp-outside-"));
  const outsideFile = join(outside, "secret.txt");
  const linkPath = join(workspace, "linked-secret.txt");
  await writeFile(outsideFile, "secret");
  await symlink(outsideFile, linkPath);
  const previous = process.env.CREATIVE_MCP_ALLOW_SYMLINKS;
  delete process.env.CREATIVE_MCP_ALLOW_SYMLINKS;
  try {
    const store = new ArtifactStore(await mkdtemp(join(tmpdir(), "creative-mcp-artifacts-")), workspace);
    await assert.rejects(() => store.assertReadableFile(linkPath), /resolves outside CREATIVE_MCP_WORKSPACE_ROOTS/);
  } finally {
    if (previous === undefined) {
      delete process.env.CREATIVE_MCP_ALLOW_SYMLINKS;
    } else {
      process.env.CREATIVE_MCP_ALLOW_SYMLINKS = previous;
    }
  }
});

test("Router rejects invalid schema input before execution", async () => {
  const server = new McpServer("test", "0.2.10-alpha.0", blenderTools);
  const result = await server.handle({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "blender.validate_asset", arguments: { maxTriangles: 10 } }
  });
  assert.equal(result.structuredContent.ok, false);
  assert.match(result.structuredContent.message, /Invalid input/);
});

test("Router rejects unknown public tool properties", async () => {
  const server = new McpServer("test", "0.2.10-alpha.0", blenderTools);
  const result = await server.handle({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "blender.configure_engine_profile",
      arguments: { engine: "WebGL", unexpected: true }
    }
  });
  assert.equal(result.structuredContent.ok, false);
  assert.match(result.structuredContent.message, /additional properties/);
});

test("Router rejects enum values outside the public schema", async () => {
  const server = new McpServer("test", "0.2.10-alpha.0", blenderTools);
  const result = await server.handle({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "blender.configure_engine_profile",
      arguments: { engine: "UnknownEngine" }
    }
  });
  assert.equal(result.structuredContent.ok, false);
  assert.match(result.structuredContent.message, /allowed values/);
});

test("Router writes approval request for project_write tools", async () => {
  const server = new McpServer("test", "0.2.10-alpha.0", blenderTools);
  const result = await server.handle({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "blender.export_game_ready", arguments: { path: resolve("examples/minimal.gltf") } }
  });
  assert.equal(result.structuredContent.ok, false);
  assert.match(result.structuredContent.message, /Approval request written/);
  assert.equal(result.structuredContent.artifacts.length, 1);
  assert.match(result.structuredContent.data.approvalToken, /^[0-9a-f-]{36}$/);
  assert.ok(result.structuredContent.data.expiresAt);
  assert.ok(result.structuredContent.data.artifactRoot);
  assert.ok(Array.isArray(result.structuredContent.data.workspaceRoots));
});

test("MCP stdio returns JSON-RPC method-not-found errors", () => {
  const child = spawnSync("node", ["packages/core/dist/server.js"], {
    input: '{"jsonrpc":"2.0","id":9,"method":"missing/method"}\n',
    encoding: "utf8",
    timeout: 5000
  });
  assert.equal(child.status, 0);
  const response = JSON.parse(child.stdout.trim());
  assert.equal(response.id, 9);
  assert.equal(response.error.code, -32601);
});

test("Director agent writes a production plan", async () => {
  const tool = directorTools.find((candidate) => candidate.name === "director.plan_production");
  assert.ok(tool);
  const result = await tool.execute(await context(), { brief: "product launch video" });
  assert.equal(result.ok, true);
  assert.equal(result.artifacts.length, 1);
});

test("Dashboard exposes token-protected artifacts and job history APIs", async () => {
  const artifactRoot = await mkdtemp(join(tmpdir(), "creative-mcp-dashboard-"));
  await mkdir(join(artifactRoot, "logs"), { recursive: true });
  await mkdir(join(artifactRoot, "premiere", "cep_status"), { recursive: true });
  await writeFile(join(artifactRoot, "report.json"), JSON.stringify({ summary: { status: "pass" } }), "utf8");
  await writeFile(join(artifactRoot, "logs", "tool.json"), JSON.stringify({ action: "core.write_run_log", status: "success" }), "utf8");
  await writeFile(join(artifactRoot, "premiere", "cep_status", "cmd.json"), JSON.stringify({
    schema: "creative.pipeline.premiere.status.v1",
    commandId: "cmd",
    commandType: "export_sequence",
    status: "success",
    message: "done",
    details: {}
  }), "utf8");
  const port = await getFreePort();
  const child = spawn("node", ["packages/dashboard/dist/server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CREATIVE_MCP_ARTIFACTS: artifactRoot,
      CREATIVE_MCP_DASHBOARD_TOKEN: "secret"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const exit = new Promise((resolveExit) => child.once("exit", resolveExit));
  try {
    await waitForDashboard(port);
    const unauthorized = await fetch(`http://127.0.0.1:${port}/api/artifacts`);
    assert.equal(unauthorized.status, 401);
    const headers = { "x-creative-mcp-dashboard-token": "secret" };
    const artifactsResponse = await fetch(`http://127.0.0.1:${port}/api/artifacts`, { headers });
    assert.equal(artifactsResponse.status, 200);
    const artifacts = await artifactsResponse.json();
    assert.ok(artifacts.artifacts.some((artifact) => artifact.relativePath === "report.json"));
    const jobsResponse = await fetch(`http://127.0.0.1:${port}/api/jobs`, { headers });
    assert.equal(jobsResponse.status, 200);
    const jobs = await jobsResponse.json();
    assert.ok(jobs.jobs.some((job) => job.kind === "log"));
    assert.ok(jobs.jobs.some((job) => job.kind === "cep_status"));
  } finally {
    child.kill();
    await Promise.race([exit, new Promise((resolveDelay) => setTimeout(resolveDelay, 1000))]);
  }
});

async function getFreePort() {
  return new Promise((resolvePort) => {
    const server = createNetServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

async function waitForDashboard(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/jobs`);
      if (response.status === 401) {
        return;
      }
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
  }
  throw new Error("Dashboard did not start");
}
