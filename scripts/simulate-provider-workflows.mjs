import { existsSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import {
  ApprovalPolicy,
  ArtifactStore,
  Router,
  ToolRegistry,
  coreTools,
  defaultLicenseManifest,
  providerTools
} from "../packages/core/dist/index.js";
import { capcutTools } from "../packages/capcut-social-mcp/dist/index.js";
import { afterEffectsTools } from "../packages/after-effects-mcp/dist/index.js";
import { robloxTools } from "../packages/roblox-pro-mcp/dist/index.js";
import { directorTools } from "../packages/director-agent/dist/index.js";

const root = process.cwd();
const artifactRoot = resolve(process.env.CREATIVE_MCP_PROVIDER_SIM_ARTIFACTS ?? "artifacts/examples/provider-simulator");
assertInside(root, artifactRoot, "CREATIVE_MCP_PROVIDER_SIM_ARTIFACTS");

rmSync(artifactRoot, { recursive: true, force: true });
await mkdir(artifactRoot, { recursive: true });

const robloxProjectRoot = join(artifactRoot, "fixtures", "roblox-demo");
await writeFixture(join(robloxProjectRoot, "default.project.json"), JSON.stringify({
  name: "ProviderSimulatorPlace",
  tree: {
    "$className": "DataModel",
    ReplicatedStorage: { "$path": "src/ReplicatedStorage" },
    StarterPlayer: {
      StarterPlayerScripts: { "$path": "src/StarterPlayerScripts" }
    },
    ServerScriptService: { "$path": "src/ServerScriptService" }
  }
}, null, 2));
await writeFixture(join(robloxProjectRoot, "src", "ReplicatedStorage", "SharedModule.luau"), "local SharedModule = {}\nreturn SharedModule\n");
await writeFixture(join(robloxProjectRoot, "src", "ServerScriptService", "Main.server.luau"), "print('provider simulator server')\n");
await writeFixture(join(robloxProjectRoot, "src", "StarterPlayerScripts", "Hud.client.luau"), "print('provider simulator client')\n");
await writeFixture(join(robloxProjectRoot, "wally.toml"), "[package]\nname = \"creative/provider-simulator\"\nversion = \"0.1.0\"\n");
await writeFixture(join(robloxProjectRoot, "selene.toml"), "std = \"roblox\"\n");
await writeFixture(join(robloxProjectRoot, "stylua.toml"), "column_width = 100\n");

const registry = new ToolRegistry();
registry.registerMany([
  ...coreTools,
  ...providerTools,
  ...capcutTools,
  ...afterEffectsTools,
  ...robloxTools,
  ...directorTools
]);
const router = new Router(registry);
const context = {
  artifactStore: new ArtifactStore(artifactRoot, root),
  approvalPolicy: new ApprovalPolicy("project_write"),
  licenseManifest: defaultLicenseManifest(),
  logger: { log() {} }
};
const commands = [];

await run("provider.check_availability", {});
await run("provider.resolve_video_editor", { preferredProvider: "capcut", allowExperimental: true });
await run("provider.resolve_motion_engine", { preferredProvider: "after_effects", allowExperimental: true });
await run("provider.resolve_game_engine", { preferredProvider: "roblox_studio", allowExperimental: true });
await run("provider.write_provider_report", { project: "provider workflow simulator", includeUnavailable: true });

await run("capcut.check_availability", {});
await run("capcut.create_social_draft", {
  title: "Provider Simulator Social Cut",
  deliveryProfile: "captioned_social_delivery",
  durationSeconds: 60,
  aspectRatio: "9:16",
  media: [
    { path: "media/intro.mp4", role: "hook" },
    { path: "media/main.mp4", role: "main" }
  ],
  captionsPath: "captions/provider-simulator.srt"
});

await run("ae.check_availability", {});
await run("ae.create_render_plan", {
  projectPath: "templates/provider-simulator.aep",
  templatePath: "templates/lower-third.aep",
  compName: "Main",
  outputFormat: "mov",
  width: 1920,
  height: 1080,
  fps: 30,
  durationSeconds: 8
});
await run("ae.render_frame_preview", { compName: "Main", frame: 12, outputPath: "artifacts/after-effects/provider-preview.png" });
await run("ae.queue_aerender", {
  projectPath: "templates/provider-simulator.aep",
  compName: "Main",
  outputPath: "artifacts/after-effects/provider-output.mov"
});
await run("ae.queue_nexrender", {
  templatePath: "templates/provider-simulator.aep",
  compName: "Main",
  outputPath: "artifacts/after-effects/provider-output.mov",
  assets: [{ type: "data", layerName: "Title", value: "Provider Simulator" }]
});
await run("ae.run_motion_qc", { compName: "Main", outputFormat: "mov", width: 1920, height: 1080, durationSeconds: 8 });
await run("ae.collect_render_evidence", {
  commandId: "provider-simulator-ae",
  engine: "aerender",
  compName: "Main",
  outputPath: "artifacts/after-effects/provider-output.mov",
  status: "queued"
});
await run("ae.prepare_render_execution", {
  commandId: "provider-simulator-ae-exec",
  engine: "aerender",
  projectPath: "templates/provider-simulator.aep",
  compName: "Main",
  outputPath: "artifacts/after-effects/provider-output.mov"
});

await run("roblox.check_availability", {});
await run("roblox.inspect_project", { projectRoot: robloxProjectRoot });
await run("roblox.inspect_place_tree", { projectRoot: robloxProjectRoot, projectFile: join(robloxProjectRoot, "default.project.json") });
await run("roblox.index_scripts", { projectRoot: robloxProjectRoot, maxFiles: 50 });
await run("roblox.validate_luau_project", { projectRoot: robloxProjectRoot });
await run("roblox.run_selene", { projectRoot: robloxProjectRoot });
await run("roblox.run_stylua_check", { projectRoot: robloxProjectRoot });
await run("roblox.generate_project_report", { projectRoot: robloxProjectRoot });
await run("roblox.collect_studio_evidence", {
  commandId: "provider-simulator-roblox",
  source: "manual",
  projectRoot: robloxProjectRoot,
  projectName: "ProviderSimulatorPlace",
  status: "pending"
});

await run("director.create_social_video", {
  brief: "Create a captioned provider-simulator social cut with Premiere first and CapCut fallback.",
  deliveryProfile: "captioned_social_delivery",
  preferredProvider: "capcut"
});
await run("video.create_edit", {
  brief: "Create a provider-simulator edit package with Premiere preferred and CapCut fallback.",
  title: "Provider Simulator Edit",
  deliveryProfile: "captioned_social_delivery",
  preferredProvider: "premiere",
  fallbackProvider: "capcut",
  aspectRatio: "9:16",
  media: [{ path: "media/provider-simulator.mp4", role: "main" }],
  captionsPath: "captions/provider-simulator.srt"
});
await run("director.create_motion_package", {
  brief: "Create a provider-simulator lower-third motion package.",
  compName: "Main",
  deliveryProfile: "motion_package_high_quality"
});
await run("director.build_roblox_feature", {
  brief: "Inspect and QC the provider simulator Roblox feature.",
  projectRoot: robloxProjectRoot
});
await run("director.create_roblox_trailer", {
  brief: "Create a trailer plan from Roblox QC evidence with CapCut fallback.",
  deliveryProfile: "shorts_1080x1920_high_quality"
});
await run("director.full_production_report", {
  project: "provider workflow simulator",
  artifacts: commands.flatMap((command) => command.artifacts)
});

const summary = {
  schema: "creative.pipeline.provider_workflow_simulation.v1",
  generatedAt: new Date().toISOString(),
  status: "pass",
  artifactRoot,
  robloxProjectRoot,
  commands,
  coverage: {
    providerRegistry: commands.some((command) => command.action.startsWith("provider.")),
    capcut: commands.some((command) => command.action.startsWith("capcut.")),
    videoEditFallback: commands.some((command) => command.action === "video.create_edit"),
    afterEffects: commands.some((command) => command.action.startsWith("ae.")),
    afterEffectsRenderEvidence: commands.some((command) => command.action === "ae.collect_render_evidence"),
    afterEffectsRenderExecutionPlan: commands.some((command) => command.action === "ae.prepare_render_execution"),
    roblox: commands.some((command) => command.action.startsWith("roblox.")),
    robloxStudioEvidence: commands.some((command) => command.action === "roblox.collect_studio_evidence"),
    director: commands.some((command) => command.action.startsWith("director.")),
    projectWriteManifests: commands.some((command) => command.action === "ae.queue_aerender") &&
      commands.some((command) => command.action === "ae.queue_nexrender")
  },
  policy: {
    rawAppProxy: false,
    typedOperationsOnly: true,
    artifactFirst: true,
    approvalForProjectWrites: true,
    liveExecutionClaims: false
  }
};
const summaryArtifact = await context.artifactStore.writeJson("providers/provider_workflow_simulation.json", summary);
const verified = await verifyArtifacts([...commands.flatMap((command) => command.artifacts), relative(artifactRoot, summaryArtifact)]);
const output = { ok: true, message: "Provider workflow simulation completed", summaryArtifact, verified, data: summary };
console.log(JSON.stringify(output, null, 2));

async function run(action, input) {
  const result = await router.run(action, context, input);
  if (!result.ok) {
    throw new Error(`${action} failed: ${result.message}`);
  }
  const artifacts = (result.artifacts ?? []).map((artifact) => relative(artifactRoot, artifact).replaceAll("\\", "/"));
  commands.push({ action, ok: result.ok, message: result.message, artifacts });
  return result;
}

async function verifyArtifacts(relativePaths) {
  const unique = [...new Set(relativePaths)];
  for (const path of unique) {
    const absolute = join(artifactRoot, path);
    if (!existsSync(absolute)) {
      throw new Error(`Missing simulator artifact: ${path}`);
    }
    if (path.endsWith(".json")) {
      JSON.parse(await readFile(absolute, "utf8"));
    }
  }
  return { artifacts: unique.length };
}

async function writeFixture(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${content.trimEnd()}\n`, "utf8");
}

function assertInside(base, target, label) {
  const delta = relative(base, target);
  if (delta.startsWith("..") || delta.startsWith("/") || delta === "") {
    if (delta !== "") {
      throw new Error(`${label} must stay inside repository root: ${target}`);
    }
  }
}
