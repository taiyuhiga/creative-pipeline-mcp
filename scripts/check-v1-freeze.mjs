import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const pkg = readJson("package.json");
const snapshot = readJson("docs/API_TOOL_SCHEMAS.snapshot.json");
const apiTools = readText("docs/API_TOOLS.md");
const apiStability = readText("docs/API_STABILITY.md");
const schemaStability = readText("docs/SCHEMA_STABILITY.md");
const artifactSchema = readText("docs/ARTIFACT_SCHEMA.md");
const cepStatusSchema = readText("docs/CEP_STATUS_SCHEMA.md");

assert(snapshot.schema === "creative.pipeline.api_tool_schemas.snapshot.v1", "tool snapshot schema must be v1");
assert(snapshot.packageVersion === pkg.version, "tool snapshot packageVersion must match package.json");
assert(Array.isArray(snapshot.tools) && snapshot.tools.length > 0, "tool snapshot must include tools");

const names = snapshot.tools.map((tool) => tool.name);
assert(new Set(names).size === names.length, "tool names must be unique");
assert([...names].sort((left, right) => left.localeCompare(right)).join("\n") === names.join("\n"), "tool names must be sorted");

for (const tool of snapshot.tools) {
  assert(apiTools.includes(`- \`${tool.name}\``), `API_TOOLS.md must list ${tool.name}`);
  assert(tool.inputSchema?.type === "object", `${tool.name} input schema must be a root object`);
  assert(tool.inputSchema.additionalProperties === false, `${tool.name} must reject unknown top-level input properties`);
  assert(isRecord(tool.inputSchema.properties), `${tool.name} input schema must expose properties`);
  if (tool.inputSchema.required !== undefined) {
    assert(Array.isArray(tool.inputSchema.required), `${tool.name} required must be an array when present`);
    for (const key of tool.inputSchema.required) {
      assert(Object.hasOwn(tool.inputSchema.properties, key), `${tool.name} required key ${key} must exist in properties`);
    }
  }
}

for (const phrase of ["ToolResult", "ok", "message", "artifacts", "data", "structuredContent"]) {
  assert(apiStability.includes(phrase), `API_STABILITY.md must define structuredContent ${phrase}`);
}

for (const phrase of [
  "Tool names",
  "Input schemas",
  "structuredContent",
  "QC report schema",
  "Artifact layout",
  "CEP status schema"
]) {
  assert(schemaStability.includes(phrase), `SCHEMA_STABILITY.md must cover ${phrase}`);
}

for (const path of ["approvals/", "pending/", "resolved/", "assets/", "blender/", "premiere/", "cep_queue/", "cep_status/", "dashboard/", "reruns/"]) {
  assert(artifactSchema.includes(path), `ARTIFACT_SCHEMA.md must freeze ${path}`);
}

const qc = readJson("docs/examples/delivery_qc_report.sample.json");
for (const key of ["kind", "target", "generatedAt", "summary", "checks"]) {
  assert(Object.hasOwn(qc, key), `delivery QC sample must include ${key}`);
}
assert(["asset", "media", "pipeline"].includes(qc.kind), "delivery QC kind must be stable");
assert(["pass", "warn", "fail"].includes(qc.summary?.status), "delivery QC summary status must be stable");
assert(Array.isArray(qc.checks), "delivery QC checks must be an array");
for (const check of qc.checks) {
  assert(["pass", "warn", "fail", "not_applicable"].includes(check.status), `delivery QC check ${check.id} has unsupported status`);
  assert(typeof check.id === "string" && typeof check.message === "string", "delivery QC checks must include id and message");
}

const allowedCommandTypes = ["build_timeline_from_otio", "export_sequence", "apply_brand_package"];
const allowedStatuses = ["success", "accepted", "error"];
for (const path of [
  "docs/examples/cep_status_timeline_success.sample.json",
  "docs/examples/cep_status_brand_success.sample.json",
  "docs/examples/cep_status_export_success.sample.json"
]) {
  const status = readJson(path);
  assert(status.schema === "creative.pipeline.premiere.status.v1", `${path} must use Premiere CEP status v1`);
  assert(allowedCommandTypes.includes(status.commandType), `${path} must use a supported CEP commandType`);
  assert(allowedStatuses.includes(status.status), `${path} must use a supported CEP status`);
  for (const key of ["commandId", "message", "details"]) {
    assert(Object.hasOwn(status, key), `${path} must include ${key}`);
  }
  assert(status.finishedAt || status.processedAt, `${path} must include a timestamp`);
}

for (const value of [...allowedCommandTypes, ...allowedStatuses, "creative.pipeline.premiere.status.v1"]) {
  assert(cepStatusSchema.includes(value), `CEP_STATUS_SCHEMA.md must document ${value}`);
}

console.log(JSON.stringify({ ok: true, version: pkg.version, tools: snapshot.tools.length }, null, 2));

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

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
