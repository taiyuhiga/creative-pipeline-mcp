import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
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
  providerTools,
  qualityProfiles
} from "../packages/core/dist/index.js";
import { assetTools } from "../packages/asset-sourcing/dist/index.js";
import { blenderTools } from "../packages/blender-pro-mcp/dist/index.js";
import { premiereTools } from "../packages/premiere-pro-mcp/dist/index.js";
import { directorTools } from "../packages/director-agent/dist/index.js";
import { capcutTools } from "../packages/capcut-social-mcp/dist/index.js";
import { afterEffectsTools } from "../packages/after-effects-mcp/dist/index.js";
import { robloxTools } from "../packages/roblox-pro-mcp/dist/index.js";

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
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.trim_clip"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.split_clip"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.move_clip"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.add_marker"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.set_clip_speed"));
  assert.ok(premiereTools.some((tool) => tool.name === "premiere.watch_export_output"));
});

test("Provider registry resolves video, motion, and game providers without raw proxies", async () => {
  const toolNames = providerTools.map((tool) => tool.name);
  for (const name of [
    "provider.check_availability",
    "provider.resolve_video_editor",
    "provider.resolve_motion_engine",
    "provider.resolve_game_engine",
    "provider.write_provider_report"
  ]) {
    assert.ok(toolNames.includes(name), `${name} should be registered`);
  }
  const availabilityTool = providerTools.find((tool) => tool.name === "provider.check_availability");
  const videoTool = providerTools.find((tool) => tool.name === "provider.resolve_video_editor");
  const reportTool = providerTools.find((tool) => tool.name === "provider.write_provider_report");
  assert.ok(availabilityTool);
  assert.ok(videoTool);
  assert.ok(reportTool);
  const availability = await availabilityTool.execute(await context(), { provider: "capcut" });
  assert.equal(availability.ok, true);
  assert.equal(availability.data.policy.rawProxy, false);
  assert.equal(availability.data.availability[0].provider, "capcut");
  assert.ok(availability.data.availability[0].blockedOperations.includes("raw_draft_overwrite"));
  const resolution = await videoTool.execute(await context(), { preferredProvider: "capcut" });
  assert.equal(resolution.ok, true);
  assert.equal(resolution.data.selected.provider, "capcut");
  const report = await reportTool.execute(await context(), { project: "provider-test" });
  assert.equal(report.ok, true);
  assert.equal(report.data.policy.rawAppProxy, false);
  assert.ok(report.artifacts.some((artifact) => artifact.endsWith("providers/provider_report.json")));
});

test("CapCut provider writes copy-on-write draft plan, manifest, and QC artifacts", async () => {
  const toolNames = capcutTools.map((tool) => tool.name);
  for (const name of [
    "capcut.check_availability",
    "capcut.create_draft_plan",
    "capcut.write_draft_manifest",
    "capcut.run_draft_qc",
    "capcut.create_social_draft"
  ]) {
    assert.ok(toolNames.includes(name), `${name} should be registered`);
  }
  const macro = capcutTools.find((tool) => tool.name === "capcut.create_social_draft");
  assert.ok(macro);
  const result = await macro.execute(await context(), {
    title: "Vertical launch clip",
    deliveryProfile: "shorts_1080x1920_high_quality",
    aspectRatio: "9:16",
    media: [{ path: "source.mp4", role: "main" }]
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.plan.copyOnWrite, true);
  assert.equal(result.data.plan.policy.noEncryptedDraftBypass, true);
  assert.equal(result.data.qc.status, "pass");
  assert.ok(result.artifacts.some((artifact) => artifact.endsWith("capcut/draft_manifest.json")));
});

test("After Effects provider writes render, queue, preview, and motion QC artifacts", async () => {
  const toolNames = afterEffectsTools.map((tool) => tool.name);
  for (const name of [
    "ae.check_availability",
    "ae.create_render_plan",
    "ae.queue_aerender",
    "ae.queue_nexrender",
    "ae.render_frame_preview",
    "ae.run_motion_qc",
    "ae.collect_render_evidence"
  ]) {
    assert.ok(toolNames.includes(name), `${name} should be registered`);
  }
  const planTool = afterEffectsTools.find((tool) => tool.name === "ae.create_render_plan");
  const queueTool = afterEffectsTools.find((tool) => tool.name === "ae.queue_aerender");
  const qcTool = afterEffectsTools.find((tool) => tool.name === "ae.run_motion_qc");
  const evidenceTool = afterEffectsTools.find((tool) => tool.name === "ae.collect_render_evidence");
  assert.ok(planTool);
  assert.ok(queueTool);
  assert.ok(qcTool);
  assert.ok(evidenceTool);
  const plan = await planTool.execute(await context(), { compName: "Main", outputFormat: "mov" });
  assert.equal(plan.ok, true);
  assert.equal(plan.data.plan.rawJsx, false);
  const queued = await queueTool.execute(await context(), { compName: "Main" });
  assert.equal(queued.ok, true);
  assert.equal(queued.data.manifest.rawJsx, false);
  assert.ok(queued.artifacts.some((artifact) => artifact.endsWith("after-effects/render_status.json")));
  const qc = await qcTool.execute(await context(), { compName: "Main", width: 1920, height: 1080, outputFormat: "mov" });
  assert.equal(qc.ok, true);
  assert.equal(qc.data.report.status, "pass");
  const pendingEvidence = await evidenceTool.execute(await context(), {
    commandId: "ae-test-pending",
    engine: "aerender",
    compName: "Main",
    outputPath: "artifacts/tests/ae-missing-output.mov",
    status: "queued"
  });
  assert.equal(pendingEvidence.ok, true);
  assert.equal(pendingEvidence.data.evidence.reportStatus, "pending");
  assert.equal(pendingEvidence.data.evidence.policy.liveExecutionClaim, false);
  const outputPath = resolve("artifacts", "tests", "ae-render-output.mov");
  await mkdir(resolve("artifacts", "tests"), { recursive: true });
  await writeFile(outputPath, "render bytes", "utf8");
  const evidence = await evidenceTool.execute(await context(process.cwd()), {
    commandId: "ae-test-success",
    engine: "aerender",
    compName: "Main",
    outputPath,
    status: "success",
    requireOutputExists: true
  });
  assert.equal(evidence.ok, true);
  assert.equal(evidence.data.evidence.reportStatus, "pass");
  assert.equal(evidence.data.evidence.policy.liveExecutionClaim, true);
});

test("Roblox provider inspects project, indexes scripts, and writes command manifests", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "creative-mcp-roblox-"));
  await mkdir(join(projectRoot, "src", "ServerScriptService"), { recursive: true });
  await writeFile(join(projectRoot, "default.project.json"), JSON.stringify({
    name: "TestPlace",
    tree: { "$className": "DataModel", ServerScriptService: { "$path": "src/ServerScriptService" } }
  }), "utf8");
  await writeFile(join(projectRoot, "src", "ServerScriptService", "Main.server.luau"), "print('ok')\n", "utf8");
  const toolNames = robloxTools.map((tool) => tool.name);
  for (const name of [
    "roblox.check_availability",
    "roblox.inspect_project",
    "roblox.inspect_place_tree",
    "roblox.index_scripts",
    "roblox.validate_luau_project",
    "roblox.sync_rojo",
    "roblox.run_wally_install",
    "roblox.run_selene",
    "roblox.run_stylua_check",
    "roblox.generate_project_report"
  ]) {
    assert.ok(toolNames.includes(name), `${name} should be registered`);
  }
  const inspect = robloxTools.find((tool) => tool.name === "roblox.inspect_project");
  const index = robloxTools.find((tool) => tool.name === "roblox.index_scripts");
  const sync = robloxTools.find((tool) => tool.name === "roblox.sync_rojo");
  const reportTool = robloxTools.find((tool) => tool.name === "roblox.generate_project_report");
  assert.ok(inspect);
  assert.ok(index);
  assert.ok(sync);
  assert.ok(reportTool);
  const inspected = await inspect.execute(await context(projectRoot), { projectRoot });
  assert.equal(inspected.ok, true);
  assert.equal(inspected.data.report.scriptCount, 1);
  const indexed = await index.execute(await context(projectRoot), { projectRoot });
  assert.equal(indexed.ok, true);
  assert.equal(indexed.data.index.scripts[0].kind, "server");
  const manifest = await sync.execute(await context(projectRoot), { projectRoot });
  assert.equal(manifest.ok, true);
  assert.equal(manifest.data.manifest.mode, "manifest_only");
  assert.equal(manifest.data.manifest.policy.noExecutorTools, true);
  const report = await reportTool.execute(await context(projectRoot), { projectRoot });
  assert.equal(report.ok, true);
  assert.equal(report.data.report.status, "ready_for_human_review");
});

test("Director provider workflows write social, motion, Roblox feature, and trailer plans", async () => {
  for (const name of [
    "director.create_social_video",
    "director.create_motion_package",
    "director.build_roblox_feature",
    "director.create_roblox_trailer"
  ]) {
    const tool = directorTools.find((candidate) => candidate.name === name);
    assert.ok(tool, `${name} should be registered`);
    const result = await tool.execute(await context(), { brief: "Create a provider-aware workflow" });
    assert.equal(result.ok, true);
    assert.ok(result.data.providerResolutionTool || result.data.providerResolutionTools?.length > 0);
  }
});

test("Video edit provider package writes CapCut fallback artifacts when Premiere is unavailable", async () => {
  const tool = directorTools.find((candidate) => candidate.name === "video.create_edit");
  assert.ok(tool);
  const result = await tool.execute(await context(), {
    brief: "Create a social edit with Premiere preferred and CapCut fallback.",
    title: "Fallback social edit",
    preferredProvider: "premiere",
    fallbackProvider: "capcut",
    deliveryProfile: "captioned_social_delivery",
    aspectRatio: "9:16",
    media: [{ path: "source.mp4", role: "main" }],
    captionsPath: "captions/source.srt"
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.plan.selectedProvider, "capcut");
  assert.equal(result.data.plan.policy.rawAppProxy, false);
  assert.equal(result.data.plan.policy.liveExecutionClaims, false);
  assert.equal(result.data.fallbackDraft.plan.copyOnWrite, true);
  assert.equal(result.data.fallbackDraft.qc.status, "pass");
  for (const suffix of [
    "video/edit_provider_resolution.json",
    "video/edit_plan.json",
    "capcut/fallback_draft_plan.json",
    "capcut/fallback_draft_manifest.json",
    "capcut/fallback_draft_qc_report.json"
  ]) {
    assert.ok(result.artifacts.some((artifact) => artifact.endsWith(suffix)), `${suffix} should be written`);
  }
});

test("Provider workflow simulator writes provider, CapCut, After Effects, Roblox, and Director artifacts", async () => {
  const artifactRoot = resolve("artifacts", "tests", "provider-simulator");
  const result = spawnSync(process.execPath, ["scripts/simulate-provider-workflows.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, CREATIVE_MCP_PROVIDER_SIM_ARTIFACTS: artifactRoot },
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.data.schema, "creative.pipeline.provider_workflow_simulation.v1");
  assert.equal(output.data.status, "pass");
  assert.equal(output.data.coverage.providerRegistry, true);
  assert.equal(output.data.coverage.capcut, true);
  assert.equal(output.data.coverage.videoEditFallback, true);
  assert.equal(output.data.coverage.afterEffects, true);
  assert.equal(output.data.coverage.afterEffectsRenderEvidence, true);
  assert.equal(output.data.coverage.roblox, true);
  assert.equal(output.data.coverage.director, true);
  assert.equal(output.data.coverage.projectWriteManifests, true);
  assert.equal(output.data.policy.rawAppProxy, false);
  assert.equal(output.data.policy.liveExecutionClaims, false);
  assert.ok(output.verified.artifacts >= 25);
  for (const artifact of [
    "providers/provider_workflow_simulation.json",
    "providers/provider_report.json",
    "video/edit_plan.json",
    "capcut/fallback_draft_manifest.json",
    "after-effects/render_evidence.json",
    "capcut/draft_qc_report.json",
    "after-effects/render_queue/aerender_command.json",
    "after-effects/render_queue/nexrender_job.json",
    "after-effects/motion_qc_report.json",
    "roblox/combined_project_report.json",
    "director/full_production_report.json"
  ]) {
    assert.ok(existsSync(join(artifactRoot, artifact)), `${artifact} should be written`);
  }
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

test("Asset sourcing tools resolve source priority and write provenance-safe artifacts", async () => {
  const toolNames = assetTools.map((tool) => tool.name);
  for (const name of [
    "asset.resolve_source_plan",
    "asset.search_candidates",
    "asset.acquire_asset",
    "asset.generate_3d",
    "asset.ingest_generated_result",
    "asset.postprocess_generated_asset",
    "asset.finalize_asset",
    "asset.write_provenance",
    "asset.acquire_or_generate"
  ]) {
    assert.ok(toolNames.includes(name), `${name} should be registered`);
  }

  const resolvePlan = assetTools.find((tool) => tool.name === "asset.resolve_source_plan");
  const search = assetTools.find((tool) => tool.name === "asset.search_candidates");
  const macro = assetTools.find((tool) => tool.name === "asset.acquire_or_generate");
  assert.ok(resolvePlan);
  assert.ok(search);
  assert.ok(macro);

  const plan = await resolvePlan.execute(await context(), {
    prompt: "modern wooden dining chair",
    intent: "generic_furniture"
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.data.plan.intent, "generic_furniture");
  assert.ok(plan.data.plan.priority.includes("polyhaven"));
  assert.equal(plan.data.plan.guardrails.serverSideFalKeyOnly, true);

  const candidates = await search.execute(await context(), {
    prompt: "studio sunset hdri",
    intent: "environment_hdri",
    maxCandidates: 4
  });
  assert.equal(candidates.ok, true);
  assert.ok(candidates.data.candidates.some((candidate) => candidate.provider === "polyhaven"));
  assert.ok(!candidates.data.candidates.some((candidate) => candidate.provider === "sketchfab"));

  const generated = await macro.execute(await context(), {
    prompt: "original fantasy crystal engine",
    intent: "generated_concept",
    policy: "force"
  });
  assert.equal(generated.ok, true);
  assert.equal(generated.data.selected.generated, true);
  assert.ok(generated.artifacts.some((artifact) => artifact.endsWith("assets/generated/fal_request.json")));
});

test("Asset sourcing tools ingest generated fal outputs and download only when explicitly enabled", async () => {
  const server = createHttpServer((request, response) => {
    if (request.url === "/model.glb") {
      response.setHeader("Content-Type", "model/gltf-binary");
      response.end(Buffer.from("glb"));
      return;
    }
    if (request.url === "/preview.png") {
      response.setHeader("Content-Type", "image/png");
      response.end(Buffer.from("png"));
      return;
    }
    if (request.url === "/albedo.png") {
      response.setHeader("Content-Type", "image/png");
      response.end(Buffer.from("texture"));
      return;
    }
    response.statusCode = 404;
    response.end("not found");
  });
  await listen(server);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const previousDownload = process.env.CREATIVE_MCP_ENABLE_ASSET_DOWNLOAD;
  process.env.CREATIVE_MCP_ENABLE_ASSET_DOWNLOAD = "true";
  try {
    const ingest = assetTools.find((tool) => tool.name === "asset.ingest_generated_result");
    assert.ok(ingest);
    const result = await ingest.execute(await context(), {
      title: "generated chair",
      download: true,
      falResult: {
        response: {
          model_mesh: { url: `${baseUrl}/model.glb` },
          thumbnail: { url: `${baseUrl}/preview.png` },
          textures: [{ albedo_url: `${baseUrl}/albedo.png` }]
        }
      }
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.manifest.outputs.length, 3);
    assert.ok(result.data.manifest.outputs.some((output) => output.role === "model"));
    assert.ok(result.data.manifest.outputs.some((output) => output.role === "preview"));
    assert.ok(result.data.manifest.outputs.some((output) => output.role === "texture"));
    assert.equal(result.data.manifest.downloaded.length, 3);
    assert.ok(result.artifacts.some((artifact) => artifact.endsWith("assets/generated/model.glb")));
    assert.ok(result.artifacts.some((artifact) => artifact.endsWith("assets/generated/preview.png")));
    assert.ok(result.artifacts.some((artifact) => artifact.endsWith("assets/generated/fal_outputs.json")));
    assert.ok(existsSync(result.artifacts.find((artifact) => artifact.endsWith("assets/generated/model.glb"))));
  } finally {
    restoreEnv("CREATIVE_MCP_ENABLE_ASSET_DOWNLOAD", previousDownload);
    await closeServer(server);
  }
});

test("Asset sourcing tools can use mocked Poly Haven and Sketchfab API adapters when enabled", async () => {
  const server = createHttpServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("Content-Type", "application/json");
    if (url.pathname === "/assets") {
      response.end(JSON.stringify({
        wooden_chair_01: {
          name: "Wooden Chair 01",
          categories: ["furniture"],
          tags: ["wooden", "chair"]
        }
      }));
      return;
    }
    if (url.pathname === "/search") {
      assert.equal(request.headers.authorization, "Token test-token");
      response.end(JSON.stringify({
        results: [{
          uid: "sketchfab-chair",
          name: "Sketchfab Chair",
          viewerUrl: "https://sketchfab.com/3d-models/sketchfab-chair",
          license: { label: "CC-BY" },
          isDownloadable: true
        }]
      }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  await listen(server);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const previousPoly = process.env.CREATIVE_MCP_ENABLE_POLYHAVEN_API;
  const previousPolyBase = process.env.CREATIVE_MCP_POLYHAVEN_API_BASE_URL;
  const previousSketchfab = process.env.CREATIVE_MCP_ENABLE_SKETCHFAB_API;
  const previousSketchfabBase = process.env.CREATIVE_MCP_SKETCHFAB_API_BASE_URL;
  const previousToken = process.env.SKETCHFAB_TOKEN;
  process.env.CREATIVE_MCP_ENABLE_POLYHAVEN_API = "true";
  process.env.CREATIVE_MCP_POLYHAVEN_API_BASE_URL = baseUrl;
  process.env.CREATIVE_MCP_ENABLE_SKETCHFAB_API = "true";
  process.env.CREATIVE_MCP_SKETCHFAB_API_BASE_URL = baseUrl;
  process.env.SKETCHFAB_TOKEN = "test-token";
  try {
    const search = assetTools.find((tool) => tool.name === "asset.search_candidates");
    assert.ok(search);
    const furniture = await search.execute(await context(), {
      prompt: "wooden chair",
      intent: "generic_furniture",
      maxCandidates: 4
    });
    assert.equal(furniture.ok, true);
    assert.ok(furniture.data.candidates.some((candidate) => candidate.id === "polyhaven:wooden_chair_01"));
    assert.ok(furniture.data.candidates.some((candidate) => candidate.id === "sketchfab:sketchfab-chair"));

    const specific = await search.execute(await context(), {
      prompt: "sketchfab chair",
      intent: "specific_object",
      maxCandidates: 4
    });
    assert.equal(specific.ok, true);
    assert.ok(specific.data.candidates.some((candidate) => candidate.provider === "sketchfab" && candidate.license === "CC-BY"));
  } finally {
    restoreEnv("CREATIVE_MCP_ENABLE_POLYHAVEN_API", previousPoly);
    restoreEnv("CREATIVE_MCP_POLYHAVEN_API_BASE_URL", previousPolyBase);
    restoreEnv("CREATIVE_MCP_ENABLE_SKETCHFAB_API", previousSketchfab);
    restoreEnv("CREATIVE_MCP_SKETCHFAB_API_BASE_URL", previousSketchfabBase);
    restoreEnv("SKETCHFAB_TOKEN", previousToken);
    await closeServer(server);
  }
});

test("Blender asset QC writes a report", async () => {
  const tool = blenderTools.find((candidate) => candidate.name === "blender.validate_asset");
  assert.ok(tool);
  assert.ok(blenderTools.some((candidate) => candidate.name === "blender.repair_basic_asset"));
  assert.ok(blenderTools.some((candidate) => candidate.name === "blender.read_bridge_status"));
  assert.ok(blenderTools.some((candidate) => candidate.name === "blender.await_bridge_status"));
  assert.ok(blenderTools.some((candidate) => candidate.name === "blender.external_adapter_health"));
  assert.ok(blenderTools.some((candidate) => candidate.name === "blender.external_import_asset"));
  assert.ok(blenderTools.some((candidate) => candidate.name === "blender.external_render_preview"));
  assert.ok(blenderTools.some((candidate) => candidate.name === "blender.external_export_asset"));
  assert.ok(blenderTools.some((candidate) => candidate.name === "blender.external_apply_transform"));
  assert.ok(blenderTools.some((candidate) => candidate.name === "blender.external_validate_scene"));
  const result = await tool.execute(await context(), {
    path: resolve("examples/minimal.gltf"),
    maxTriangles: 10
  });
  assert.equal(result.ok, true);
  assert.equal(result.artifacts.length, 1);
});

test("External Blender MCP adapter is disabled by default and writes bounded manifests only", async () => {
  const previousEnabled = process.env.CREATIVE_MCP_ENABLE_EXTERNAL_BLENDER_MCP;
  const previousUrl = process.env.CREATIVE_MCP_EXTERNAL_BLENDER_MCP_URL;
  delete process.env.CREATIVE_MCP_ENABLE_EXTERNAL_BLENDER_MCP;
  delete process.env.CREATIVE_MCP_EXTERNAL_BLENDER_MCP_URL;
  try {
    const healthTool = blenderTools.find((candidate) => candidate.name === "blender.external_adapter_health");
    const previewTool = blenderTools.find((candidate) => candidate.name === "blender.external_render_preview");
    assert.ok(healthTool);
    assert.ok(previewTool);
    const health = await healthTool.execute(await context(), {});
    assert.equal(health.ok, false);
    assert.equal(health.data.enabled, false);
    const preview = await previewTool.execute(await context(), { path: resolve("examples/minimal.gltf") });
    assert.equal(preview.ok, true);
    assert.equal(preview.artifacts.length, 1);
    assert.equal(preview.data.manifest.rawProxy, false);
    assert.ok(preview.data.manifest.blockedOperations.includes("execute_blender_code"));
  } finally {
    restoreEnv("CREATIVE_MCP_ENABLE_EXTERNAL_BLENDER_MCP", previousEnabled);
    restoreEnv("CREATIVE_MCP_EXTERNAL_BLENDER_MCP_URL", previousUrl);
  }
});

test("External Blender MCP adapter simulator handles only bounded import, preview, export, transform, and validate operations", async () => {
  const requests = [];
  const server = createHttpServer(async (request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", async () => {
      const payload = JSON.parse(body);
      requests.push(payload);
      response.setHeader("Content-Type", "application/json");
      if (payload.method === "tools/list") {
        response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result: { tools: [] } }));
        return;
      }
      const args = payload.params.arguments;
      if (payload.params.name === "blender.import_asset") {
        response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result: { ok: true, imported: args.sourcePath } }));
        return;
      } else if (payload.params.name === "blender.render_preview") {
        await writeFile(args.outputPath, Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lrWZ2wAAAABJRU5ErkJggg==",
          "base64"
        ));
      } else if (payload.params.name === "blender.export_asset") {
        await writeFile(args.outputPath, await readFile(args.sourcePath));
      } else if (payload.params.name === "blender.apply_transform") {
        await writeFile(args.outputPath, await readFile(args.sourcePath));
      } else if (payload.params.name === "blender.validate_scene") {
        response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result: { ok: true, validated: args.sourcePath } }));
        return;
      } else {
        response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, error: { code: -32601, message: "unsupported tool" } }));
        return;
      }
      response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result: { ok: true } }));
    });
  });
  await listen(server);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const previousEnabled = process.env.CREATIVE_MCP_ENABLE_EXTERNAL_BLENDER_MCP;
  const previousUrl = process.env.CREATIVE_MCP_EXTERNAL_BLENDER_MCP_URL;
  const previousAllow = process.env.CREATIVE_MCP_EXTERNAL_BLENDER_MCP_ALLOW;
  process.env.CREATIVE_MCP_ENABLE_EXTERNAL_BLENDER_MCP = "true";
  process.env.CREATIVE_MCP_EXTERNAL_BLENDER_MCP_URL = `http://127.0.0.1:${address.port}/mcp`;
  process.env.CREATIVE_MCP_EXTERNAL_BLENDER_MCP_ALLOW = "health,import,preview,export,transform,validate";
  try {
    const source = resolve("examples/minimal.gltf");
    const healthTool = blenderTools.find((candidate) => candidate.name === "blender.external_adapter_health");
    const importTool = blenderTools.find((candidate) => candidate.name === "blender.external_import_asset");
    const previewTool = blenderTools.find((candidate) => candidate.name === "blender.external_render_preview");
    const exportTool = blenderTools.find((candidate) => candidate.name === "blender.external_export_asset");
    const transformTool = blenderTools.find((candidate) => candidate.name === "blender.external_apply_transform");
    const validateTool = blenderTools.find((candidate) => candidate.name === "blender.external_validate_scene");
    assert.ok(healthTool);
    assert.ok(importTool);
    assert.ok(previewTool);
    assert.ok(exportTool);
    assert.ok(transformTool);
    assert.ok(validateTool);
    const health = await healthTool.execute(await context(), {});
    assert.equal(health.ok, true);
    const imported = await importTool.execute(await context(), { path: source, collectionName: "ImportedAssets" });
    assert.equal(imported.ok, true);
    assert.equal(imported.artifacts.length, 3);
    const preview = await previewTool.execute(await context(), { path: source });
    assert.equal(preview.ok, true);
    assert.equal(preview.artifacts.length, 3);
    const exported = await exportTool.execute(await context(), { path: source, format: "gltf", outputName: "simulated-output" });
    assert.equal(exported.ok, true);
    assert.equal(exported.artifacts.length, 3);
    assert.ok(exported.artifacts.some((artifact) => artifact.endsWith("simulated-output.gltf")));
    const transformed = await transformTool.execute(await context(), {
      path: source,
      transform: { scale: [1, 1, 1], rotation: [0, 0, 0], translation: [0, 0, 0] },
      format: "gltf",
      outputName: "simulated-transform"
    });
    assert.equal(transformed.ok, true);
    assert.equal(transformed.artifacts.length, 3);
    assert.ok(transformed.artifacts.some((artifact) => artifact.endsWith("simulated-transform.gltf")));
    const validated = await validateTool.execute(await context(), { path: source });
    assert.equal(validated.ok, true);
    assert.equal(validated.artifacts.length, 3);
    assert.deepEqual(requests.map((request) => request.method), ["tools/list", "tools/call", "tools/call", "tools/call", "tools/call", "tools/call"]);
    assert.deepEqual(requests.slice(1).map((request) => request.params.name), [
      "blender.import_asset",
      "blender.render_preview",
      "blender.export_asset",
      "blender.apply_transform",
      "blender.validate_scene"
    ]);
    assert.ok(!requests.some((request) => JSON.stringify(request).includes("execute_blender_code")));
  } finally {
    restoreEnv("CREATIVE_MCP_ENABLE_EXTERNAL_BLENDER_MCP", previousEnabled);
    restoreEnv("CREATIVE_MCP_EXTERNAL_BLENDER_MCP_URL", previousUrl);
    restoreEnv("CREATIVE_MCP_EXTERNAL_BLENDER_MCP_ALLOW", previousAllow);
    await closeServer(server);
  }
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

test("Premiere typed edit tools queue bounded CEP commands with safety metadata", async () => {
  const mediaRoot = await mkdtemp(join(tmpdir(), "creative-mcp-edit-media-"));
  const mediaPath = join(mediaRoot, "placeholder.mp4");
  await writeFile(mediaPath, new Uint8Array([0]));
  const queueRoot = await mkdtemp(join(tmpdir(), "creative-mcp-edit-queue-"));
  const previousQueue = process.env.CREATIVE_MCP_PREMIERE_IPC_DIR;
  const previousStatus = process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR;
  process.env.CREATIVE_MCP_PREMIERE_IPC_DIR = queueRoot;
  process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR = join(mediaRoot, "cep_status");
  try {
    const calls = [
      ["premiere.trim_clip", { path: mediaPath, trackIndex: 0, clipIndex: 0, endSeconds: 1.5, idempotencyKey: "trim-1" }],
      ["premiere.split_clip", { path: mediaPath, trackIndex: 0, clipIndex: 0, splitSeconds: 0.5 }],
      ["premiere.move_clip", { path: mediaPath, trackIndex: 0, clipIndex: 0, startSeconds: 2 }],
      ["premiere.add_marker", { path: mediaPath, timeSeconds: 0.25, name: "Hook" }],
      ["premiere.set_clip_speed", { path: mediaPath, trackIndex: 0, clipIndex: 0, speedPercent: 125 }]
    ];
    for (const [name, input] of calls) {
      const tool = premiereTools.find((candidate) => candidate.name === name);
      assert.ok(tool);
      const result = await tool.execute(await context(mediaRoot), input);
      assert.equal(result.ok, true);
      assert.equal(result.artifacts.length, 2);
      assert.equal(result.data.command.requiresApproval, true);
      assert.ok(result.data.command.commandId);
      assert.equal(result.data.command.id, result.data.command.commandId);
      assert.ok(result.data.command.idempotencyKey);
      assert.ok(Array.isArray(result.data.command.expectedSideEffects));
      assert.ok(result.data.command.statusJsonPath.endsWith(`${result.data.command.commandId}.json`));
      assert.ok(result.data.command.rollbackHint);
      assert.equal(result.data.manifest.schema, "creative.pipeline.premiere.typed_edit.v1");
    }
    const queueFiles = (await readdir(queueRoot)).filter((file) => file.endsWith(".json"));
    assert.equal(queueFiles.length, 5);
    const queuedTypes = await Promise.all(queueFiles.map(async (file) => JSON.parse(await readFile(join(queueRoot, file), "utf8")).type));
    assert.deepEqual(queuedTypes.sort(), ["add_marker", "move_clip", "set_clip_speed", "split_clip", "trim_clip"]);
  } finally {
    if (previousQueue === undefined) {
      delete process.env.CREATIVE_MCP_PREMIERE_IPC_DIR;
    } else {
      process.env.CREATIVE_MCP_PREMIERE_IPC_DIR = previousQueue;
    }
    if (previousStatus === undefined) {
      delete process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR;
    } else {
      process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR = previousStatus;
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
      type: "trim_clip",
      payload: {
        target: { trackType: "video", trackIndex: 0, clipIndex: 0 },
        operation: { trim: { inPointSeconds: 0.1, endSeconds: 0.9 } }
      },
      createdAt: new Date().toISOString()
    },
    {
      id: "cmd-3",
      type: "split_clip",
      payload: {
        target: { trackType: "video", trackIndex: 0, clipIndex: 0 },
        operation: { splitSeconds: 0.5 }
      },
      createdAt: new Date().toISOString()
    },
    {
      id: "cmd-4",
      type: "move_clip",
      payload: {
        target: { trackType: "video", trackIndex: 0, clipIndex: 0 },
        operation: { startSeconds: 1.25 }
      },
      createdAt: new Date().toISOString()
    },
    {
      id: "cmd-5",
      type: "add_marker",
      payload: {
        operation: { marker: { timeSeconds: 0.25, name: "Hook", comments: "first beat" } }
      },
      createdAt: new Date().toISOString()
    },
    {
      id: "cmd-6",
      type: "set_clip_speed",
      payload: {
        target: { trackType: "video", trackIndex: 0, clipIndex: 0 },
        operation: { speedPercent: 125, maintainPitch: true }
      },
      createdAt: new Date().toISOString()
    },
    {
      id: "cmd-7",
      type: "apply_brand_package",
      payload: { brand: { primaryColor: "#111111" }, appliesTo: ["captions"] },
      createdAt: new Date().toISOString()
    },
    {
      id: "cmd-8",
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
  assert.equal(summary.processed, 8);
  assert.equal(summary.state.imported.length, 1);
  assert.equal(summary.state.inserted.length, 1);
  assert.ok(summary.state.trims.length >= 1);
  assert.ok(summary.state.moves.length >= 1);
  assert.equal(summary.state.markers.length, 1);
  assert.equal(summary.state.speeds.length, 1);
  assert.equal(summary.state.exports.length, 1);
  const statuses = await Promise.all(commands.map(async (command) => JSON.parse(await readFile(join(statusRoot, `${command.id}.json`), "utf8"))));
  assert.deepEqual(statuses.map((status) => status.status), ["success", "success", "accepted", "success", "success", "success", "success", "success"]);
  assert.deepEqual(statuses.map((status) => status.commandType), [
    "build_timeline_from_otio",
    "trim_clip",
    "split_clip",
    "move_clip",
    "add_marker",
    "set_clip_speed",
    "apply_brand_package",
    "export_sequence"
  ]);
  const remainingQueueFiles = (await readdir(queueRoot)).filter((file) => file.endsWith(".json"));
  assert.equal(remainingQueueFiles.length, 0);
  const archived = (await readdir(join(queueRoot, "processed"))).filter((file) => file.endsWith(".json"));
  assert.equal(archived.length, 8);
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
  await mkdir(join(artifactRoot, "providers"), { recursive: true });
  await mkdir(join(artifactRoot, "capcut"), { recursive: true });
  await mkdir(join(artifactRoot, "after-effects"), { recursive: true });
  await mkdir(join(artifactRoot, "roblox"), { recursive: true });
  await writeFile(join(artifactRoot, "report.json"), JSON.stringify({ summary: { status: "pass" } }), "utf8");
  await writeFile(join(artifactRoot, "logs", "tool.json"), JSON.stringify({ action: "core.write_run_log", status: "success" }), "utf8");
  await writeFile(join(artifactRoot, "logs", "failed.json"), JSON.stringify({
    action: "director.plan_production",
    input: { brief: "retry this production plan" },
    risk: "safe_write",
    status: "failed"
  }), "utf8");
  await writeFile(join(artifactRoot, "logs", "failed-provider.json"), JSON.stringify({
    action: "provider.write_provider_report",
    input: { project: "retry provider report" },
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
  await writeFile(join(artifactRoot, "providers", "provider_report.json"), JSON.stringify({
    schema: "creative.pipeline.provider_report.v1",
    project: "dashboard",
    resolutions: [{ domain: "video_editor", selected: { provider: "capcut", available: false } }],
    policy: { rawAppProxy: false }
  }), "utf8");
  await writeFile(join(artifactRoot, "capcut", "draft_qc_report.json"), JSON.stringify({
    schema: "creative.pipeline.capcut_draft_qc.v1",
    title: "Dashboard draft",
    status: "pass",
    policy: { rawProxy: false }
  }), "utf8");
  await writeFile(join(artifactRoot, "after-effects", "motion_qc_report.json"), JSON.stringify({
    schema: "creative.pipeline.ae_motion_qc.v1",
    compName: "Main",
    status: "pass",
    policy: { rawJsxDefault: false }
  }), "utf8");
  await writeFile(join(artifactRoot, "roblox", "combined_project_report.json"), JSON.stringify({
    schema: "creative.pipeline.roblox_combined_project_report.v1",
    status: "ready_for_human_review",
    policy: { noExecutorTools: true }
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
    const providersResponse = await fetch(`http://127.0.0.1:${port}/api/providers`, { headers });
    assert.equal(providersResponse.status, 200);
    const providers = await providersResponse.json();
    assert.ok(providers.reports.some((report) => report.path === "providers/provider_report.json"));
    assert.ok(providers.reports.some((report) => report.path === "capcut/draft_qc_report.json"));
    assert.ok(providers.reports.some((report) => report.path === "after-effects/motion_qc_report.json"));
    assert.ok(providers.reports.some((report) => report.path === "roblox/combined_project_report.json"));
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
    assert.ok(jobs.jobs.some((job) => job.id === "failed-provider.json" && job.retryable === true));
    const retryResponse = await fetch(`http://127.0.0.1:${port}/api/jobs/retry`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ id: "failed.json" })
    });
    assert.equal(retryResponse.status, 200);
    const providerRetryResponse = await fetch(`http://127.0.0.1:${port}/api/jobs/retry`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ id: "failed-provider.json" })
    });
    assert.equal(providerRetryResponse.status, 200);
    const rerunsResponse = await fetch(`http://127.0.0.1:${port}/api/reruns`, { headers });
    assert.equal(rerunsResponse.status, 200);
    const reruns = await rerunsResponse.json();
    assert.equal(reruns.reruns.length, 2);
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

async function listen(server) {
  await new Promise((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });
}

async function closeServer(server) {
  await new Promise((resolveClose) => {
    server.close(resolveClose);
  });
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
