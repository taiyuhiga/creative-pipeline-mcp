import { spawnSync } from "node:child_process";

const checks = [
  ["ffprobe", ["-version"]],
  ["ffmpeg", ["-version"]],
  [process.env.BLENDER_BIN ?? "blender", ["--version"]],
  [process.env.GLTF_TRANSFORM_BIN ?? "gltf-transform", ["--version"]],
  [process.env.GLTFPACK_BIN ?? "gltfpack", ["-v"]]
];

let available = 0;
for (const [command, args] of checks) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  const ok = result.status === 0;
  if (ok) available += 1;
  console.log(`${ok ? "ok" : "missing"} ${command}`);
}

console.log(`${available}/${checks.length} optional adapters available`);

