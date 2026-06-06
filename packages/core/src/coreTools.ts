import type { ToolDefinition } from "./types.js";

export const coreTools: ToolDefinition[] = [
  {
    name: "core.health",
    description: "Return server health and artifact root.",
    category: "core",
    risk: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async execute(context) {
      return {
        ok: true,
        message: "creative-mcp-core is healthy",
        data: { artifactRoot: context.artifactStore.root }
      };
    }
  },
  {
    name: "core.license_manifest",
    description: "Return direct, optional external, and reference-only dependency license posture.",
    category: "core",
    risk: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async execute(context) {
      const manifest = context.licenseManifest.list();
      const artifact = await context.artifactStore.writeJson("license_manifest.json", manifest);
      return {
        ok: true,
        message: "License manifest written",
        artifacts: [artifact],
        data: { manifest }
      };
    }
  }
];

