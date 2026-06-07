import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), "creative-mcp-npm-smoke-"));
const packDir = join(tempRoot, "pack");
const appDir = join(tempRoot, "app");
mkdirSync(packDir, { recursive: true });
mkdirSync(appDir, { recursive: true });

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
run("npm", ["pack", "--pack-destination", packDir], root);
const tgz = join(packDir, `creative-pipeline-mcp-${packageJson.version}.tgz`);
writeFileSync(join(appDir, "package.json"), JSON.stringify({ type: "module", private: true }, null, 2), "utf8");
run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tgz], appDir);
writeFileSync(
  join(appDir, "smoke.mjs"),
  `
import { coreTools } from "creative-pipeline-mcp/core";
import { blenderTools } from "creative-pipeline-mcp/blender";
import { premiereTools } from "creative-pipeline-mcp/premiere";
import { directorTools } from "creative-pipeline-mcp/director";

if (!coreTools.some((tool) => tool.name === "core.health")) throw new Error("missing core.health");
if (!blenderTools.some((tool) => tool.name === "blender.validate_asset")) throw new Error("missing blender.validate_asset");
if (!premiereTools.some((tool) => tool.name === "premiere.run_delivery_qc")) throw new Error("missing premiere.run_delivery_qc");
if (!directorTools.some((tool) => tool.name === "director.plan_production")) throw new Error("missing director.plan_production");
console.log(JSON.stringify({ ok: true, package: "creative-pipeline-mcp", version: ${JSON.stringify(packageJson.version)} }));
`,
  "utf8"
);
run("node", ["smoke.mjs"], appDir);

if (!process.argv.includes("--keep-temp")) {
  rmSync(tempRoot, { recursive: true, force: true });
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}
