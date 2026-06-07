#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { coreTools } from "../packages/core/dist/coreTools.js";
import { blenderTools } from "../packages/blender-pro-mcp/dist/index.js";
import { premiereTools } from "../packages/premiere-pro-mcp/dist/index.js";
import { directorTools } from "../packages/director-agent/dist/index.js";

const root = process.cwd();
const snapshotPath = resolve(root, "docs", "API_TOOL_SCHEMAS.snapshot.json");
const snapshot = buildSnapshot();
const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;

if (process.argv.includes("--write")) {
  writeFileSync(snapshotPath, serialized, "utf8");
  console.log(JSON.stringify({ ok: true, snapshotPath, tools: snapshot.tools.length }, null, 2));
  process.exit(0);
}

const expected = readFileSync(snapshotPath, "utf8");
if (normalizeNewlines(expected) !== serialized) {
  throw new Error(`Tool schema snapshot is out of date. Run: node scripts/check-tool-schemas.mjs --write`);
}

console.log(JSON.stringify({ ok: true, snapshotPath, tools: snapshot.tools.length }, null, 2));

function buildSnapshot() {
  const tools = [
    ...coreTools,
    ...blenderTools,
    ...premiereTools,
    ...directorTools
  ].map((tool) => ({
    name: tool.name,
    category: tool.category,
    risk: tool.risk,
    description: tool.description,
    inputSchema: sortJson(tool.inputSchema)
  })).sort((left, right) => left.name.localeCompare(right.name));
  return {
    schema: "creative.pipeline.api_tool_schemas.snapshot.v1",
    packageVersion: JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version,
    generatedFrom: [
      "packages/core/dist/coreTools.js",
      "packages/blender-pro-mcp/dist/index.js",
      "packages/premiere-pro-mcp/dist/index.js",
      "packages/director-agent/dist/index.js"
    ],
    tools
  };
}

function sortJson(value) {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJson(nested)])
    );
  }
  return value;
}

function normalizeNewlines(value) {
  return value.replace(/\r\n/g, "\n");
}
