import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  ApprovalPolicy,
  ArtifactStore,
  JSON_RPC_ERRORS,
  STRUCTURED_TOOL_ERROR_CODES,
  defaultLicenseManifest,
  deliveryProfiles,
  getDeliveryProfile,
  getQualityProfile,
  McpServer,
  qualityProfiles
} from "../packages/core/dist/index.js";
import { blenderTools } from "../packages/blender-pro-mcp/dist/index.js";
import { premiereTools } from "../packages/premiere-pro-mcp/dist/index.js";
import { directorTools } from "../packages/director-agent/dist/index.js";

const packageVersion = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;

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
  const server = new McpServer("test", packageVersion, blenderTools);
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
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.build_project_delivery"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.measure_vmaf"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.validate_subtitles"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.cleanup_subtitles"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.apply_timeline_markers"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.watch_export_output"));
});

test("Delivery and quality profiles define QC-checkable highest-quality outputs", async () => {
  assert.ok(getDeliveryProfile("youtube_4k_high_quality"));
  assert.ok(getDeliveryProfile("game_ready_glb"));
  assert.ok(getQualityProfile("shorts_1080x1920_high_quality"));
  assert.ok(getQualityProfile("cycles_final_exr")?.experimental);

  for (const profile of deliveryProfiles) {
    assert.ok(profile.id);
    assert.ok(["premiere", "blender"].includes(profile.domain));
    assert.ok(Object.keys(profile.qcThresholds).length > 0);
    assert.ok(Object.keys(profile.artifactNaming).length > 0);
    assert.ok(profile.expectedOutputs.length > 0);
    JSON.stringify(profile);
  }

  for (const profile of qualityProfiles) {
    assert.ok(profile.id);
    assert.ok(["premiere", "blender"].includes(profile.domain));
    assert.ok(profile.appliesTo.length > 0);
    assert.ok(Object.keys(profile.settings).length > 0);
    assert.ok(Object.keys(profile.qcThresholds).length > 0);
    assert.ok(profile.expectedArtifacts.length > 0);
    JSON.stringify(profile);
  }

  const exampleIds = [
    "youtube_4k_high_quality",
    "shorts_1080x1920_high_quality",
    "game_ready_glb",
    "cycles_final_exr"
  ];
  for (const id of exampleIds) {
    const example = JSON.parse(await readFile(resolve("examples", "profiles", `${id}.json`), "utf8"));
    assert.equal(example.id, id);
    assert.ok(getDeliveryProfile(id) || getQualityProfile(id));
    assert.ok(example.expectedOutputs.length > 0);
  }
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

test("Blender asset QC checks texture files, dimensions, PBR data, naming, and bounds", async () => {
  const assetRoot = await mkdtemp(join(tmpdir(), "creative-mcp-textured-gltf-"));
  const texturePath = join(assetRoot, "albedo.png");
  await writeFile(texturePath, Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lrWZ2wAAAABJRU5ErkJggg==",
    "base64"
  ));
  const assetPath = join(assetRoot, "textured.gltf");
  await writeFile(assetPath, JSON.stringify({
    asset: { version: "2.0" },
    nodes: [{ name: "Hero_Crate.001", mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
        indices: 3,
        material: 0
      }]
    }],
    accessors: [
      { count: 3, min: [0, 0, 0], max: [2, 1, 1] },
      { count: 3 },
      { count: 3 },
      { count: 3 }
    ],
    materials: [{
      name: "PBR_Material",
      pbrMetallicRoughness: { baseColorTexture: { index: 0 } }
    }],
    textures: [{ source: 0 }],
    images: [{ uri: "albedo.png" }]
  }), "utf8");
  const tool = blenderTools.find((candidate) => candidate.name === "blender.validate_asset");
  assert.ok(tool);
  const result = await tool.execute(await context(assetRoot), {
    path: assetPath,
    maxTriangles: 10,
    maxDimension: 1
  });
  assert.equal(result.ok, true);
  const byId = new Map(result.data.checks.map((check) => [check.id, check]));
  assert.equal(byId.get("textures.files").status, "pass");
  assert.equal(byId.get("textures.dimensions").value.imagesWithDimensions, 1);
  assert.equal(byId.get("textures.total_size").status, "pass");
  assert.equal(byId.get("materials.pbr_completeness").status, "pass");
  assert.equal(byId.get("objects.naming").status, "pass");
  assert.equal(byId.get("bounds.max_dimension").status, "warn");
});

test("Blender asset QC fails missing external texture files", async () => {
  const assetRoot = await mkdtemp(join(tmpdir(), "creative-mcp-missing-texture-"));
  const assetPath = join(assetRoot, "missing-texture.gltf");
  await writeFile(assetPath, JSON.stringify({
    asset: { version: "2.0" },
    nodes: [{ name: "MissingTextureAsset", mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
        indices: 3,
        material: 0
      }]
    }],
    accessors: [
      { count: 3, min: [0, 0, 0], max: [1, 1, 1] },
      { count: 3 },
      { count: 3 },
      { count: 3 }
    ],
    materials: [{
      name: "PBR_Material",
      pbrMetallicRoughness: { baseColorTexture: { index: 0 } }
    }],
    textures: [{ source: 0 }],
    images: [{ uri: "missing.png" }]
  }), "utf8");
  const tool = blenderTools.find((candidate) => candidate.name === "blender.validate_asset");
  assert.ok(tool);
  const result = await tool.execute(await context(assetRoot), { path: assetPath });
  assert.equal(result.ok, false);
  const textureFileCheck = result.data.checks.find((check) => check.id === "textures.files");
  assert.equal(textureFileCheck.status, "fail");
  assert.equal(textureFileCheck.value, 1);
});

test("Blender game asset generation writes a safe script artifact", async () => {
  const tool = blenderTools.find((candidate) => candidate.name === "blender.create_game_asset");
  assert.ok(tool);
  const queueRoot = await mkdtemp(join(tmpdir(), "creative-mcp-blender-queue-"));
  const previous = process.env.CREATIVE_MCP_BLENDER_IPC_DIR;
  const previousBlender = process.env.BLENDER_BIN;
  process.env.CREATIVE_MCP_BLENDER_IPC_DIR = queueRoot;
  process.env.BLENDER_BIN = "/definitely/missing/blender";
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
    assert.match(script, /CrateBody/);
    assert.equal(result.data.manifest.template, "lowpoly_crate");
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
    if (previousBlender === undefined) {
      delete process.env.BLENDER_BIN;
    } else {
      process.env.BLENDER_BIN = previousBlender;
    }
  }
});

test("Blender game asset generation supports production templates", async () => {
  const tool = blenderTools.find((candidate) => candidate.name === "blender.create_game_asset");
  assert.ok(tool);
  const queueRoot = await mkdtemp(join(tmpdir(), "creative-mcp-blender-template-"));
  const previousQueue = process.env.CREATIVE_MCP_BLENDER_IPC_DIR;
  const previousBlender = process.env.BLENDER_BIN;
  process.env.CREATIVE_MCP_BLENDER_IPC_DIR = queueRoot;
  process.env.BLENDER_BIN = "/definitely/missing/blender";
  try {
    const result = await tool.execute(await context(), {
      prompt: "hero blast door",
      template: "sci_fi_door",
      budget: { maxTriangles: 1000, maxDimension: 3 }
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.manifest.template, "sci_fi_door");
    assert.deepEqual(result.data.manifest.outputs, [
      "blender/hero_blast_door.glb",
      "blender/hero_blast_door_preview.png",
      "blender/hero_blast_door_optimized.glb",
      "blender/hero_blast_door_asset_qc_report.json"
    ]);
    const scriptPath = result.artifacts.find((artifact) => artifact.endsWith("create_game_asset_safe.py"));
    const script = await readFile(scriptPath, "utf8");
    assert.match(script, /DoorPanel_L/);
    assert.match(script, /DoorLight_Center/);
  } finally {
    if (previousQueue === undefined) {
      delete process.env.CREATIVE_MCP_BLENDER_IPC_DIR;
    } else {
      process.env.CREATIVE_MCP_BLENDER_IPC_DIR = previousQueue;
    }
    if (previousBlender === undefined) {
      delete process.env.BLENDER_BIN;
    } else {
      process.env.BLENDER_BIN = previousBlender;
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
    assert.equal(brandResult.artifacts.length, 3);
    assert.equal(brandResult.data.manifest.schema, "creative.pipeline.brand_package.v1");
    assert.ok(brandResult.data.preview.captionStyle);
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

test("Premiere project delivery builder writes artifacts and queues CEP commands", async () => {
  const mediaRoot = await mkdtemp(join(tmpdir(), "creative-mcp-media-"));
  const mediaPath = join(mediaRoot, "placeholder.mp4");
  await writeFile(mediaPath, new Uint8Array([0]));
  const queueRoot = await mkdtemp(join(tmpdir(), "creative-mcp-project-queue-"));
  const previous = process.env.CREATIVE_MCP_PREMIERE_IPC_DIR;
  process.env.CREATIVE_MCP_PREMIERE_IPC_DIR = queueRoot;
  try {
    const tool = premiereTools.find((candidate) => candidate.name === "premiere.build_project_delivery");
    assert.ok(tool);
    const result = await tool.execute(await context(mediaRoot), {
      path: mediaPath,
      template: "youtube_16x9",
      sequenceName: "Project Delivery Test",
      targetDuration: 12,
      brand: { primaryColor: "#123456" },
      outputPath: join(mediaRoot, "final.mp4")
    });
    assert.equal(result.ok, true);
    assert.equal(result.artifacts.length, 7);
    assert.equal(result.data.template.template, "youtube_16x9");
    assert.equal(result.data.exportPlan.preset, "1920x1080_h264");
    assert.equal(result.data.brandPackage.appliesTo.includes("lower_thirds"), true);
    const queueFiles = (await readdir(queueRoot)).filter((file) => file.endsWith(".json"));
    assert.equal(queueFiles.length, 3);
    const queued = await Promise.all(queueFiles.map(async (file) => JSON.parse(await readFile(join(queueRoot, file), "utf8"))));
    assert.deepEqual(queued.map((command) => command.type).sort(), [
      "apply_brand_package",
      "build_timeline_from_otio",
      "export_sequence"
    ]);
    const timeline = queued.find((command) => command.type === "build_timeline_from_otio");
    assert.equal(timeline.payload.sequenceName, "Project Delivery Test");
    assert.equal(timeline.payload.template, "youtube_16x9");
  } finally {
    if (previous === undefined) {
      delete process.env.CREATIVE_MCP_PREMIERE_IPC_DIR;
    } else {
      process.env.CREATIVE_MCP_PREMIERE_IPC_DIR = previous;
    }
  }
});

test("Premiere timeline marker tool queues safe margin and intro/outro markers", async () => {
  const mediaRoot = await mkdtemp(join(tmpdir(), "creative-mcp-marker-media-"));
  const mediaPath = join(mediaRoot, "placeholder.mp4");
  await writeFile(mediaPath, new Uint8Array([0]));
  const queueRoot = await mkdtemp(join(tmpdir(), "creative-mcp-marker-queue-"));
  const previous = process.env.CREATIVE_MCP_PREMIERE_IPC_DIR;
  process.env.CREATIVE_MCP_PREMIERE_IPC_DIR = queueRoot;
  try {
    const tool = premiereTools.find((candidate) => candidate.name === "premiere.apply_timeline_markers");
    assert.ok(tool);
    const result = await tool.execute(await context(mediaRoot), {
      path: mediaPath,
      intro: { startSeconds: 0, endSeconds: 4 },
      outro: { startSeconds: 56, endSeconds: 60 }
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.manifest.markers.length, 3);
    const queueFiles = (await readdir(queueRoot)).filter((file) => file.endsWith(".json"));
    assert.equal(queueFiles.length, 1);
    const queued = JSON.parse(await readFile(join(queueRoot, queueFiles[0]), "utf8"));
    assert.equal(queued.type, "apply_timeline_markers");
  } finally {
    if (previous === undefined) {
      delete process.env.CREATIVE_MCP_PREMIERE_IPC_DIR;
    } else {
      process.env.CREATIVE_MCP_PREMIERE_IPC_DIR = previous;
    }
  }
});

test("Premiere subtitle tools validate and cleanup SRT captions", async () => {
  const mediaRoot = await mkdtemp(join(tmpdir(), "creative-mcp-subtitles-"));
  const subtitlePath = join(mediaRoot, "captions.srt");
  await writeFile(subtitlePath, [
    "1",
    "00:00:00,000 --> 00:00:01,000",
    "This caption is deliberately much too long for a one second reading window",
    "",
    "2",
    "00:00:00,900 --> 00:00:02,000",
    "Overlap cue",
    ""
  ].join("\n"), "utf8");
  const validateTool = premiereTools.find((candidate) => candidate.name === "premiere.validate_subtitles");
  const cleanupTool = premiereTools.find((candidate) => candidate.name === "premiere.cleanup_subtitles");
  assert.ok(validateTool);
  assert.ok(cleanupTool);
  const validateResult = await validateTool.execute(await context(mediaRoot), { path: subtitlePath });
  assert.equal(validateResult.ok, false);
  assert.equal(validateResult.data.validation.overlaps, 1);
  const cleanupResult = await cleanupTool.execute(await context(mediaRoot), {
    path: subtitlePath,
    maxCharsPerLine: 24
  });
  assert.equal(cleanupResult.ok, true);
  assert.equal(cleanupResult.data.after.overlaps, 0);
  assert.equal(cleanupResult.artifacts.length, 2);
});

test("Premiere CEP simulator dispatches host.jsx queue commands", async () => {
  const mediaRoot = await mkdtemp(join(tmpdir(), "creative-mcp-cep-sim-media-"));
  const queueRoot = await mkdtemp(join(tmpdir(), "creative-mcp-cep-sim-queue-"));
  const statusRoot = await mkdtemp(join(tmpdir(), "creative-mcp-cep-sim-status-"));
  const mediaPath = join(mediaRoot, "clip.mp4");
  const otioPath = join(mediaRoot, "timeline.otio");
  const outputPath = join(mediaRoot, "final.mp4");
  await writeFile(mediaPath, new Uint8Array([0]));
  await writeFile(otioPath, JSON.stringify({
    OTIO_SCHEMA: "Timeline.1",
    name: "Simulated Timeline",
    tracks: [{
      OTIO_SCHEMA: "Track.1",
      kind: "Video",
      children: [{
        OTIO_SCHEMA: "Clip.2",
        name: "clip.mp4",
        media_reference: { target_url: mediaPath },
        source_range: {
          start_time: { value: 0, rate: 30 },
          duration: { value: 30, rate: 30 }
        }
      }]
    }]
  }), "utf8");
  const commands = [
    {
      id: "cmd-1",
      type: "build_timeline_from_otio",
      payload: { otioPath, sequenceName: "Simulated Timeline" },
      createdAt: new Date().toISOString()
    },
    {
      id: "cmd-2",
      type: "apply_brand_package",
      payload: { brand: { primaryColor: "#111111" }, appliesTo: ["captions"] },
      createdAt: new Date().toISOString()
    },
    {
      id: "cmd-3",
      type: "export_sequence",
      payload: { outputPath, presetPath: "" },
      createdAt: new Date().toISOString()
    }
  ];
  for (const command of commands) {
    await writeFile(join(queueRoot, `${command.id}.json`), JSON.stringify(command), "utf8");
  }
  const result = spawnSync("node", [
    "scripts/simulate-premiere-cep.mjs",
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
  assert.equal(summary.processed, 3);
  assert.equal(summary.state.imported.length, 1);
  assert.equal(summary.state.inserted.length, 1);
  assert.equal(summary.state.exports.length, 1);
  const statuses = await Promise.all(commands.map(async (command) => JSON.parse(await readFile(join(statusRoot, `${command.id}.json`), "utf8"))));
  assert.deepEqual(statuses.map((status) => status.status), ["success", "success", "success"]);
  assert.deepEqual(statuses.map((status) => status.commandType), [
    "build_timeline_from_otio",
    "apply_brand_package",
    "export_sequence"
  ]);
  const remainingQueueFiles = (await readdir(queueRoot)).filter((file) => file.endsWith(".json"));
  assert.equal(remainingQueueFiles.length, 0);
  const archived = (await readdir(join(queueRoot, "processed"))).filter((file) => file.endsWith(".json"));
  assert.equal(archived.length, 3);
});

test("Premiere CEP simulator rejects unsupported command types", async () => {
  const queueRoot = await mkdtemp(join(tmpdir(), "creative-mcp-cep-reject-queue-"));
  const statusRoot = await mkdtemp(join(tmpdir(), "creative-mcp-cep-reject-status-"));
  await writeFile(join(queueRoot, "cmd-raw.json"), JSON.stringify({
    id: "cmd-raw",
    type: "run_extendscript",
    payload: { code: "app.project.closeDocument()" },
    createdAt: new Date().toISOString()
  }), "utf8");
  const result = spawnSync("node", [
    "scripts/simulate-premiere-cep.mjs",
    "--queue",
    queueRoot,
    "--status",
    statusRoot
  ], {
    cwd: resolve("."),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const status = JSON.parse(await readFile(join(statusRoot, "cmd-raw.json"), "utf8"));
  assert.equal(status.status, "error");
  assert.match(status.message, /unsupported command/);
});

test("Premiere CEP package script writes a verified unsigned package", async () => {
  const result = spawnSync("node", ["scripts/package-premiere-cep.mjs", "--verify"], {
    cwd: resolve("."),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  const rootPackage = JSON.parse(await readFile("package.json", "utf8"));
  const cepVersion = rootPackage.version.replace(/-.+$/, "");
  assert.equal(summary.ok, true);
  assert.equal(summary.version, rootPackage.version);
  assert.equal(summary.cepVersion, cepVersion);
  assert.ok(summary.package.endsWith(`creative-pipeline-mcp-premiere-cep-panel-${rootPackage.version}.zip`));
  assert.ok(summary.checksums.endsWith("premiere-cep-checksums.txt"));
  const listing = spawnSync("unzip", ["-l", summary.package], { encoding: "utf8" });
  assert.equal(listing.status, 0, listing.stderr);
  assert.match(listing.stdout, /CSXS\/manifest\.xml/);
  assert.match(listing.stdout, /jsx\/host\.jsx/);
  assert.match(listing.stdout, /js\/main\.js/);
});

test("Premiere CEP install script installs from packaged zip", async () => {
  const packageResult = spawnSync("node", ["scripts/package-premiere-cep.mjs", "--verify"], {
    cwd: resolve("."),
    encoding: "utf8"
  });
  assert.equal(packageResult.status, 0, packageResult.stderr);
  const summary = JSON.parse(packageResult.stdout);
  const installRoot = await mkdtemp(join(tmpdir(), "creative-mcp-cep-install-"));
  const target = join(installRoot, "panel");
  const installResult = spawnSync("node", [
    "scripts/install-premiere-cep.mjs",
    "--package",
    summary.package,
    "--target",
    target
  ], {
    cwd: resolve("."),
    encoding: "utf8"
  });
  assert.equal(installResult.status, 0, installResult.stderr);
  assert.equal(existsSync(join(target, "CSXS", "manifest.xml")), true);
  assert.equal(existsSync(join(target, "jsx", "host.jsx")), true);
  assert.equal(existsSync(join(target, "js", "main.js")), true);
  const uninstallResult = spawnSync("node", [
    "scripts/install-premiere-cep.mjs",
    "--uninstall",
    "--target",
    target
  ], {
    cwd: resolve("."),
    encoding: "utf8"
  });
  assert.equal(uninstallResult.status, 0, uninstallResult.stderr);
  assert.equal(existsSync(target), false);
});

test("Premiere CEP panel can preload a configured queue directory", async () => {
  const panelScript = await readFile("packages/premiere-cep-panel/js/main.js", "utf8");
  const manifest = await readFile("packages/premiere-cep-panel/CSXS/manifest.xml", "utf8");
  assert.match(panelScript, /premiere-cep\.json/);
  assert.match(panelScript, /__adobe_cep__/);
  assert.match(panelScript, /cep_node/);
  assert.match(panelScript, /systemPathToLocalPath/);
  assert.match(panelScript, /config\.queueDir/);
  assert.match(panelScript, /queueDir\.value = configuredQueueDir/);
  assert.match(panelScript, /refreshQueue\(\)/);
  assert.match(panelScript, /runFilesSequentially/);
  assert.match(panelScript, /commandPriority/);
  assert.match(panelScript, /build_timeline_from_otio/);
  assert.match(panelScript, /export_sequence/);
  assert.match(panelScript, /left in queue because CEP returned an unreadable status/);
  assert.match(manifest, /--mixed-context/);
  assert.match(manifest, /--allow-file-access/);
});

test("Premiere CEP host uses ExtendScript-safe JSON status timestamps", async () => {
  const hostScript = await readFile("packages/premiere-cep-panel/jsx/host.jsx", "utf8");
  assert.match(hostScript, /CreativePipelineMCP\.timestamp/);
  assert.match(hostScript, /getUTCFullYear/);
  assert.doesNotMatch(hostScript, /finishedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(hostScript, /dispatch failed/);
});

test("Public tool schemas match the committed snapshot", () => {
  const result = spawnSync("node", ["scripts/check-tool-schemas.mjs"], {
    cwd: resolve("."),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.ok, true);
  assert.ok(summary.tools >= 40);
});

test("JSON-RPC error constants match the public fixture", async () => {
  const fixture = JSON.parse(await readFile("docs/examples/json_rpc_errors.sample.json", "utf8"));
  assert.equal(fixture.errors.parseError.code, JSON_RPC_ERRORS.parseError);
  assert.equal(fixture.errors.invalidRequest.code, JSON_RPC_ERRORS.invalidRequest);
  assert.equal(fixture.errors.methodNotFound.code, JSON_RPC_ERRORS.methodNotFound);
  assert.equal(fixture.errors.invalidParams.code, JSON_RPC_ERRORS.invalidParams);
  assert.equal(fixture.errors.toolExecutionError.code, JSON_RPC_ERRORS.toolExecutionError);
  assert.equal(fixture.structuredToolErrors.adapterMissing.code, STRUCTURED_TOOL_ERROR_CODES.adapterMissing);
  assert.equal(fixture.structuredToolErrors.approvalRequired.code, STRUCTURED_TOOL_ERROR_CODES.approvalRequired);
});

test("npm publish workflow is configured for guarded trusted publishing", async () => {
  const workflow = await readFile(".github/workflows/npm-publish.yml", "utf8");
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /node-version: "24"/);
  assert.match(workflow, /registry-url: "https:\/\/registry\.npmjs\.org"/);
  assert.match(workflow, /NPM_TRUSTED_PUBLISHING_ENABLED == 'true'/);
  assert.match(workflow, /npm pack --dry-run/);
  assert.match(workflow, /npm publish --access public/);
  assert.match(workflow, /Verify release tag matches package version/);
  const rootPackage = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(rootPackage.repository.url, "git+https://github.com/taiyuhiga/creative-pipeline-mcp.git");
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
  if (!result.ok) {
    assert.equal(result.data.error.code, "adapter_missing");
  }
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

test("Premiere export watcher writes pending artifact while output is missing", async () => {
  const statusRoot = await mkdtemp(join(tmpdir(), "creative-mcp-watch-status-"));
  const outputPath = join(statusRoot, "missing-final.mp4");
  const statusPath = join(statusRoot, "cmd-watch.json");
  await mkdir(statusRoot, { recursive: true });
  await writeFile(statusPath, JSON.stringify({
    schema: "creative.pipeline.premiere.status.v1",
    commandId: "cmd-watch",
    commandType: "export_sequence",
    status: "success",
    message: "export complete",
    details: { outputPath }
  }), "utf8");
  const previous = process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR;
  process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR = statusRoot;
  try {
    const tool = premiereTools.find((candidate) => candidate.name === "premiere.watch_export_output");
    assert.ok(tool);
    const result = await tool.execute(await context(statusRoot), {
      commandId: "cmd-watch",
      timeoutMs: 0
    });
    assert.equal(result.ok, false);
    const pending = JSON.parse(await readFile(result.artifacts[0], "utf8"));
    assert.equal(pending.reason, "output_file_not_found");
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
  const server = new McpServer("test", packageVersion, blenderTools);
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
  const server = new McpServer("test", packageVersion, blenderTools);
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
  const server = new McpServer("test", packageVersion, blenderTools);
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
  const server = new McpServer("test", packageVersion, blenderTools);
  const result = await server.handle({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "blender.export_game_ready", arguments: { path: resolve("examples/minimal.gltf") } }
  });
  assert.equal(result.structuredContent.ok, false);
  assert.match(result.structuredContent.message, /Approval request written/);
  assert.equal(result.structuredContent.artifacts.length, 2);
  assert.match(result.structuredContent.data.approvalToken, /^[0-9a-f-]{36}$/);
  assert.equal(result.structuredContent.data.error.code, "approval_required");
  assert.match(result.structuredContent.data.audit, /approvals\/audit/);
  assert.ok(result.structuredContent.data.expiresAt);
  assert.ok(result.structuredContent.data.artifactRoot);
  assert.ok(Array.isArray(result.structuredContent.data.workspaceRoots));
});

test("Raw bpy and raw ExtendScript surfaces are disabled by default", async () => {
  const toolNames = [...blenderTools, ...premiereTools].map((tool) => tool.name);
  assert.equal(toolNames.some((name) => /raw|execute_.*script|extendscript|bpy/u.test(name)), false);
  const blenderAssetTool = blenderTools.find((tool) => tool.name === "blender.create_game_asset");
  assert.ok(blenderAssetTool);
  assert.equal(blenderAssetTool.risk, "safe_write");
  const host = await readFile("packages/premiere-cep-panel/jsx/host.jsx", "utf8");
  assert.match(host, /unsupported command/);
  assert.doesNotMatch(host, /eval\(|new Function/u);
});

test("External adapter code avoids shell string execution", async () => {
  const adapterFiles = [
    "packages/blender-pro-mcp/src/adapters/cli.ts",
    "packages/premiere-pro-mcp/src/adapters/ffmpegQc.ts",
    "packages/premiere-pro-mcp/src/adapters/optionalTools.ts",
    "packages/premiere-pro-mcp/src/adapters/premiereCep.ts"
  ];
  for (const file of adapterFiles) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /\bexec\(/u);
  }
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
  await mkdir(join(artifactRoot, "premiere", "qc"), { recursive: true });
  await mkdir(join(artifactRoot, "premiere", "thumbnails"), { recursive: true });
  await mkdir(join(artifactRoot, "blender", "previews"), { recursive: true });
  await writeFile(join(artifactRoot, "report.json"), JSON.stringify({ summary: { status: "pass" } }), "utf8");
  await writeFile(join(artifactRoot, "logs", "tool.json"), JSON.stringify({ action: "core.write_run_log", status: "success" }), "utf8");
  await writeFile(join(artifactRoot, "logs", "failed.json"), JSON.stringify({
    action: "director.plan_production",
    input: { brief: "retry this production plan" },
    risk: "safe_write",
    status: "failed"
  }), "utf8");
  await writeFile(join(artifactRoot, "adapter_check_report.json"), JSON.stringify({
    summary: { available: 1, total: 2 },
    adapters: {
      ffmpeg: { available: true, command: "ffmpeg", status: 0 },
      blender: { available: false, command: "blender", status: null }
    }
  }), "utf8");
  await writeFile(join(artifactRoot, "premiere", "qc", "delivery_qc_report.json"), JSON.stringify({
    schema: "creative.pipeline.delivery_qc_report.v1",
    summary: { status: "pass" },
    warnings: []
  }), "utf8");
  await writeFile(join(artifactRoot, "premiere", "cep_status", "cmd.json"), JSON.stringify({
    schema: "creative.pipeline.premiere.status.v1",
    commandId: "cmd",
    commandType: "export_sequence",
    status: "success",
    message: "done",
    details: {}
  }), "utf8");
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lrWZ2wAAAABJRU5ErkJggg==",
    "base64"
  );
  await writeFile(join(artifactRoot, "blender", "previews", "cube_preview.png"), tinyPng);
  await writeFile(join(artifactRoot, "premiere", "thumbnails", "frame_thumbnail.png"), tinyPng);
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
    const downloadResponse = await fetch(`http://127.0.0.1:${port}/api/artifacts/file?path=report.json`, { headers });
    assert.equal(downloadResponse.status, 200);
    const adaptersResponse = await fetch(`http://127.0.0.1:${port}/api/adapters`, { headers });
    assert.equal(adaptersResponse.status, 200);
    const adapters = await adaptersResponse.json();
    assert.equal(adapters.reports[0].summary.available, 1);
    const qcResponse = await fetch(`http://127.0.0.1:${port}/api/qc-reports`, { headers });
    assert.equal(qcResponse.status, 200);
    const qcReports = await qcResponse.json();
    assert.ok(qcReports.reports.some((report) => report.path === "premiere/qc/delivery_qc_report.json"));
    const cepResponse = await fetch(`http://127.0.0.1:${port}/api/cep-status`, { headers });
    assert.equal(cepResponse.status, 200);
    const cepStatuses = await cepResponse.json();
    assert.ok(cepStatuses.statuses.some((status) => status.commandType === "export_sequence"));
    const blenderGalleryResponse = await fetch(`http://127.0.0.1:${port}/api/gallery?kind=blender`, { headers });
    assert.equal(blenderGalleryResponse.status, 200);
    const blenderGallery = await blenderGalleryResponse.json();
    assert.ok(blenderGallery.items.some((item) => item.path === "blender/previews/cube_preview.png"));
    const premiereGalleryResponse = await fetch(`http://127.0.0.1:${port}/api/gallery?kind=premiere`, { headers });
    assert.equal(premiereGalleryResponse.status, 200);
    const premiereGallery = await premiereGalleryResponse.json();
    assert.ok(premiereGallery.items.some((item) => item.path === "premiere/thumbnails/frame_thumbnail.png"));
    const jobsResponse = await fetch(`http://127.0.0.1:${port}/api/jobs`, { headers });
    assert.equal(jobsResponse.status, 200);
    const jobs = await jobsResponse.json();
    assert.ok(jobs.jobs.some((job) => job.kind === "log"));
    assert.ok(jobs.jobs.some((job) => job.kind === "cep_status"));
    assert.ok(jobs.jobs.some((job) => job.id === "failed.json" && job.retryable === true));
    const retryResponse = await fetch(`http://127.0.0.1:${port}/api/jobs/retry`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ id: "failed.json" })
    });
    assert.equal(retryResponse.status, 200);
    const rerunsResponse = await fetch(`http://127.0.0.1:${port}/api/reruns`, { headers });
    assert.equal(rerunsResponse.status, 200);
    const reruns = await rerunsResponse.json();
    assert.equal(reruns.reruns.length, 1);
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
