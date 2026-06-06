import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const json = process.argv.includes("--json");
const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
const outputPath = resolve(outputArg?.slice("--output=".length) || "artifacts/adapter_check_report.json");

const checks = [
  { label: "ffprobe", command: "ffprobe", args: ["-version"] },
  { label: "ffmpeg", command: "ffmpeg", args: ["-version"] },
  { label: "ffmpeg-libvmaf", command: "ffmpeg", args: ["-hide_banner", "-filters"], contains: "libvmaf" },
  { label: "blender", command: process.env.BLENDER_BIN ?? "blender", args: ["--version"] },
  { label: "gltf-transform", command: process.env.GLTF_TRANSFORM_BIN ?? "gltf-transform", args: ["--version"] },
  { label: "gltfpack", command: process.env.GLTFPACK_BIN ?? "gltfpack", args: ["-v"] },
  { label: "whisperx", command: process.env.WHISPERX_BIN ?? "whisperx", args: ["--help"] },
  { label: "scenedetect", command: process.env.SCENEDETECT_BIN ?? "scenedetect", args: ["--help"] },
  { label: "pyloudnorm+soundfile", command: process.env.PYTHON_BIN ?? "python3", args: ["-c", "import pyloudnorm, soundfile; print('pyloudnorm ok')"] }
];

let available = 0;
const adapters = {};
for (const { label, command, args, contains } of checks) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const ok = result.status === 0 && (!contains || output.includes(contains));
  if (ok) available += 1;
  adapters[label] = {
    available: ok,
    command,
    status: result.status,
    requiredOutput: contains,
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
