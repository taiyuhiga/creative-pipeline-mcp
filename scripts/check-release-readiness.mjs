import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "CHANGELOG.md",
  "docs/API_STABILITY.md",
  "docs/API_TOOL_SCHEMAS.snapshot.json",
  "docs/ARTIFACT_SCHEMA.md",
  "docs/ASSET_SOURCING_POLICY.md",
  "docs/CEP_STATUS_SCHEMA.md",
  "docs/V1_SCOPE.md",
  "docs/DELIVERY_PROFILES.md",
  "docs/QUALITY_PRESETS.md",
  "docs/EXTERNAL_MCP_ADAPTERS.md",
  "docs/EXTERNAL_BLENDER_MCP_ADAPTER.md",
  "docs/APP_INTEGRATION_STRATEGY.md",
  "docs/PROVIDER_REGISTRY.md",
  "docs/PROVIDER_SIMULATOR.md",
  "docs/CAPCUT_ADAPTERS.md",
  "docs/CAPCUT_SECURITY.md",
  "docs/CAPCUT_PROVIDER.md",
  "docs/AFTER_EFFECTS_ADAPTERS.md",
  "docs/AE_SECURITY.md",
  "docs/AE_QUALITY_PRESETS.md",
  "docs/ROBLOX_ADAPTERS.md",
  "docs/ROBLOX_SECURITY.md",
  "docs/ROBLOX_WORKFLOW.md",
  "docs/MIGRATIONS.md",
  "docs/MCP_REGISTRY.md",
  "docs/SCHEMA_STABILITY.md",
  "docs/EXAMPLE_PROJECTS.md",
  "docs/INSTALL_PREMIERE.md",
  "docs/PREMIERE_MCP_REFERENCES.md",
  "docs/examples/adapter_check_report.sample.json",
  "docs/examples/provider_workflow_simulation.sample.json",
  "docs/examples/cep_status_export_success.sample.json",
  "docs/examples/delivery_qc_report.sample.json",
  "examples/projects/youtube-16x9/project.json",
  "examples/projects/game-asset/project.json",
  "examples/projects/asset-sourcing/project.json",
  "examples/profiles/youtube_4k_high_quality.json",
  "examples/profiles/shorts_1080x1920_high_quality.json",
  "examples/profiles/game_ready_glb.json",
  "examples/profiles/cycles_final_exr.json",
  "examples/mcp/claude_desktop_config.json",
  "examples/mcp/cursor_mcp_config.json",
  "examples/mcp/vscode_mcp_config.json",
  "server.json",
  "scripts/check-lockfile-installability.mjs",
  "scripts/wait-premiere-e2e-status.mjs",
  "scripts/simulate-provider-workflows.mjs",
  "scripts/check-v1-freeze.mjs",
  ".github/workflows/ci.yml",
  ".github/workflows/windows-premiere-e2e.yml",
  ".github/workflows/npm-publish.yml",
  ".github/RELEASE_NOTES_TEMPLATE.md"
];

const pkg = readJson("package.json");
const snapshot = readJson("docs/API_TOOL_SCHEMAS.snapshot.json");
assert(snapshot.packageVersion === pkg.version, "API tool schema snapshot packageVersion must match package.json");
assert(Array.isArray(snapshot.tools) && snapshot.tools.length > 0, "API tool schema snapshot must include tools");
assert(pkg.files.includes("docs"), "package files must include docs");
assert(pkg.files.includes("examples"), "package files must include examples");
assert(pkg.files.includes("server.json"), "package files must include server.json");
assert(pkg.mcpName, "package must define mcpName for MCP Registry ownership verification");
assert(pkg.scripts["check:schemas"], "package must expose check:schemas");
assert(pkg.scripts["check:lockfile"], "package must expose check:lockfile");
assert(pkg.scripts["check:v1-freeze"], "package must expose check:v1-freeze");
assert(pkg.scripts["check:release"], "package must expose check:release");
assert(pkg.scripts["simulate:providers"], "package must expose simulate:providers");
assert(pkg.scripts["smoke:npm-install"], "package must expose smoke:npm-install");
assert(pkg.scripts["wait:premiere-e2e"], "package must expose wait:premiere-e2e");

for (const file of requiredFiles) {
  const text = readText(file);
  assert(text.trim().length > 0, `${file} must exist and be non-empty`);
}

const stability = readText("docs/SCHEMA_STABILITY.md");
for (const phrase of [
  "Tool names",
  "Input schemas",
  "structuredContent",
  "QC report schema",
  "Artifact layout",
  "CEP status schema"
]) {
  assert(stability.includes(phrase), `SCHEMA_STABILITY.md must cover ${phrase}`);
}

const installPremiere = readText("docs/INSTALL_PREMIERE.md");
assert(installPremiere.includes("--verify"), "INSTALL_PREMIERE.md must document unsigned CEP verification");
assert(installPremiere.includes("--sign"), "INSTALL_PREMIERE.md must document signed ZXP generation");
assert(installPremiere.includes("--zxp"), "INSTALL_PREMIERE.md must document ZXP install fallback");

const serverJson = readJson("server.json");
assert(serverJson.name === pkg.mcpName, "server.json name must match package mcpName");
assert(serverJson.version === pkg.version, "server.json version must match package version");
assert(serverJson.packages?.[0]?.registryType === "npm", "server.json must describe npm package distribution");
assert(serverJson.packages?.[0]?.identifier === pkg.name, "server.json npm identifier must match package name");
assert(serverJson.packages?.[0]?.version === pkg.version, "server.json package version must match package version");
assert(serverJson.packages?.[0]?.transport?.type === "stdio", "server.json transport must be stdio");

console.log(JSON.stringify({ ok: true, version: pkg.version, checkedFiles: requiredFiles.length, tools: snapshot.tools.length }, null, 2));

function readText(path) {
  return readFileSync(join(root, path), "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
