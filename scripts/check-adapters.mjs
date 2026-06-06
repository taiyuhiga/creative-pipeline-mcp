import { spawnSync } from "node:child_process";

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
for (const [label, command, args] of checks) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  const ok = result.status === 0;
  if (ok) available += 1;
  console.log(`${ok ? "ok" : "missing"} ${label}`);
}

console.log(`${available}/${checks.length} optional adapters available`);
