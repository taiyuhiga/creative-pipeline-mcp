import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const statusDir = resolve(root, argValue("--status") ?? "artifacts/examples/premiere-project-delivery/cep_status");
const timeoutMinutes = Number(argValue("--timeout-minutes") ?? "30");
const timeoutMs = Math.max(1, timeoutMinutes) * 60_000;
const pollMs = 5_000;
const required = new Set(["build_timeline_from_otio", "apply_brand_package", "export_sequence"]);
const acceptableStatuses = new Set(["success", "accepted"]);
const startedAt = Date.now();

while (Date.now() - startedAt < timeoutMs) {
  const statuses = readStatuses();
  const completed = new Set(
    statuses
      .filter((status) => required.has(String(status.commandType)))
      .filter((status) => acceptableStatuses.has(String(status.status)))
      .map((status) => String(status.commandType))
  );
  if ([...required].every((commandType) => completed.has(commandType))) {
    console.log(JSON.stringify({ ok: true, statusDir, completed: [...completed], statuses }, null, 2));
    process.exit(0);
  }
  const failed = statuses.find((status) => required.has(String(status.commandType)) && String(status.status) === "error");
  if (failed) {
    console.error(JSON.stringify({ ok: false, statusDir, error: failed, statuses }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: false, waiting: [...required].filter((commandType) => !completed.has(commandType)), statusDir }, null, 2));
  await new Promise((resolveDelay) => setTimeout(resolveDelay, pollMs));
}

console.error(JSON.stringify({ ok: false, error: "Timed out waiting for Premiere CEP statuses", statusDir, timeoutMinutes, statuses: readStatuses() }, null, 2));
process.exit(1);

function readStatuses() {
  try {
    return readdirSync(statusDir)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => JSON.parse(readFileSync(join(statusDir, entry), "utf8")));
  } catch {
    return [];
  }
}

function argValue(name) {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}
