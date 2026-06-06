import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const root = process.cwd();
const panelSource = resolve(root, "packages", "premiere-cep-panel");
const extensionId = "com.creative-pipeline.mcp.panel";
const targetArg = readArg("--target");
const packageArg = readArg("--package") ?? readArg("--zxp");
const uninstall = process.argv.includes("--uninstall");
const target = resolve(targetArg || defaultCepTarget());

if (uninstall) {
  rmSync(target, { recursive: true, force: true });
  console.log(`Removed ${target}`);
  process.exit(0);
}

const extracted = packageArg ? extractPackage(resolve(packageArg)) : null;
const cleanupPaths = extracted ? [extracted.cleanupPath] : [];
const source = extracted?.source ?? panelSource;
validateCepSource(source);

rmSync(target, { recursive: true, force: true });
mkdirSync(dirname(target), { recursive: true });
cpSync(source, target, {
  recursive: true,
  filter(source) {
    return basename(source) !== "node_modules";
  }
});
for (const cleanupPath of cleanupPaths) {
  rmSync(cleanupPath, { recursive: true, force: true });
}

console.log(`Installed Premiere CEP panel to ${target}`);
console.log("Enable CEP debug mode for unsigned extensions before launching Premiere.");

function readArg(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function extractPackage(packagePath) {
  if (!existsSync(packagePath)) {
    throw new Error(`CEP package not found: ${packagePath}`);
  }
  const tempRoot = mkdtempSync(join(tmpdir(), "creative-mcp-cep-install-"));
  const result = spawnSync("unzip", ["-q", packagePath, "-d", tempRoot], { encoding: "utf8" });
  if (result.status !== 0) {
    rmSync(tempRoot, { recursive: true, force: true });
    throw new Error(`Could not extract CEP package ${packagePath}:\n${result.stdout}\n${result.stderr}`);
  }
  if (existsSync(join(tempRoot, "CSXS", "manifest.xml"))) {
    return { source: tempRoot, cleanupPath: tempRoot };
  }
  const nested = readdirSync(tempRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(tempRoot, entry.name))
    .find((candidate) => existsSync(join(candidate, "CSXS", "manifest.xml")));
  if (nested) {
    return { source: nested, cleanupPath: tempRoot };
  }
  rmSync(tempRoot, { recursive: true, force: true });
  throw new Error(`CEP package does not contain CSXS/manifest.xml: ${packagePath}`);
}

function validateCepSource(source) {
  for (const required of ["CSXS/manifest.xml", "index.html", "js/main.js", "jsx/host.jsx", "package.json"]) {
    if (!existsSync(join(source, required))) {
      throw new Error(`CEP source missing required file: ${join(source, required)}`);
    }
  }
}

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
