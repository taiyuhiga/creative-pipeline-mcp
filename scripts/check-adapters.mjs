import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const json = process.argv.includes("--json");
const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const outputPath = resolve(outputArg?.slice("--output=".length) || "artifacts/adapter_check_report.json");

const checks = [
  ["ffprobe", "ffprobe", ["-version"]],
  ["ffmpeg", "ffmpeg", ["-version"]],
  ["blender", process.env.BLENDER_BIN ?? "blender", ["--version"]],
  ["gltf-transform", process.env.GLTF_TRANSFORM_BIN ?? "gltf-transform", ["--version"]],
  ["gltfpack", process.env.GLTFPACK_BIN ?? "gltfpack", ["-v"]],
  ["whisperx", process.env.WHISPERX_BIN ?? "whisperx", ["--help"]],
  ["scenedetect", process.env.SCENEDETECT_BIN ?? "scenedetect", ["--help"]],
  ["pyloudnorm+soundfile", process.env.PYTHON_BIN ?? "python3", ["-c", "import pyloudnorm, soundfile; print('pyloudnorm ok')"]]
];

let available = 0;
const adapters = {};
for (const [label, command, args] of checks) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  const ok = result.status === 0;
  if (ok) available += 1;
  adapters[label] = {
    available: ok,
    command,
    status: result.status,
    stderr: ok ? undefined : result.stderr?.trim().slice(0, 500)
  };
  if (!json) {
    console.log(`${ok ? "ok" : "missing"} ${label}`);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    available,
    total: checks.length
  },
  adapters
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`${available}/${checks.length} optional adapters available`);
  console.log(`adapter report written: ${outputPath}`);
}
