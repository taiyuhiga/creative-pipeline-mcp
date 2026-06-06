import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const root = process.cwd();
const panelSource = resolve(root, "packages", "premiere-cep-panel");
const extensionId = "com.creative-pipeline.mcp.panel";
const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
const uninstall = process.argv.includes("--uninstall");
const target = resolve(targetArg?.slice("--target=".length) || defaultCepTarget());

if (!existsSync(panelSource)) {
  throw new Error(`CEP panel source not found: ${panelSource}`);
}

if (uninstall) {
  rmSync(target, { recursive: true, force: true });
  console.log(`Removed ${target}`);
  process.exit(0);
}

mkdirSync(target, { recursive: true });
rmSync(target, { recursive: true, force: true });
cpSync(panelSource, target, {
  recursive: true,
  filter(source) {
    return basename(source) !== "node_modules";
  }
});

console.log(`Installed Premiere CEP panel to ${target}`);
console.log("Enable CEP debug mode for unsigned extensions before launching Premiere.");

function defaultCepTarget() {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Adobe", "CEP", "extensions", extensionId);
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(appData, "Adobe", "CEP", "extensions", extensionId);
  }
  return join(homedir(), ".creative-pipeline-mcp", "CEP", "extensions", extensionId);
}
