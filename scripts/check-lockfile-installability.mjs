import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const keepTemp = process.env.CREATIVE_MCP_KEEP_LOCKFILE_CHECK_TMP === "true";
const tempRoot = mkdtempSync(join(tmpdir(), "creative-mcp-lockfile-"));
const installRoot = join(tempRoot, "repo");
const cacheRoot = join(tempRoot, "npm-cache");

try {
  mkdirSync(installRoot, { recursive: true });
  mkdirSync(cacheRoot, { recursive: true });

  const pkg = readJson("package.json");
  copyFile("package.json");
  copyFile("package-lock.json");

  for (const workspacePattern of pkg.workspaces ?? []) {
    if (!workspacePattern.endsWith("/*")) {
      throw new Error(`Unsupported workspace pattern for lockfile installability check: ${workspacePattern}`);
    }
    const workspaceRoot = workspacePattern.slice(0, -2);
    const sourceWorkspaceRoot = join(root, workspaceRoot);
    const targetWorkspaceRoot = join(installRoot, workspaceRoot);
    mkdirSync(targetWorkspaceRoot, { recursive: true });
    cpSync(sourceWorkspaceRoot, targetWorkspaceRoot, {
      recursive: true,
      filter: (source) => {
        const relative = source.slice(sourceWorkspaceRoot.length + 1);
        if (!relative) return true;
        const parts = relative.split(/[\\/]/);
        if (parts.length === 1) return true;
        return basename(source) === "package.json";
      }
    });
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, [
    "ci",
    "--ignore-scripts",
    "--prefer-online",
    "--no-audit",
    "--fund=false",
    "--cache",
    cacheRoot
  ], {
    cwd: installRoot,
    env: {
      ...process.env,
      npm_config_progress: "false"
    },
    encoding: "utf8"
  });

  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`package-lock.json is not installable from npm registry in a clean cache (exit ${result.status})`);
  }

  console.log(JSON.stringify({
    ok: true,
    package: pkg.name,
    version: pkg.version,
    tempRoot: keepTemp ? tempRoot : undefined
  }, null, 2));
} finally {
  if (!keepTemp) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function copyFile(path) {
  const target = join(installRoot, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(resolve(root, path)));
}
