import type { ToolDefinition } from "../types.js";
import { checkProviderAvailability } from "./appAvailability.js";
import { getProviderCapability, providerCapabilities, providersForDomain, type ProviderDomain } from "./providerCapabilities.js";
import { resolveProvider } from "./providerResolver.js";

const domainSchema = { type: "string", enum: ["video_editor", "motion_engine", "game_engine"] };

export const providerTools: ToolDefinition[] = [
  {
    name: "provider.check_availability",
    description: "Inspect local availability and safety posture for registered creative app providers.",
    category: "provider",
    risk: "read",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string" },
        domain: domainSchema
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const providerId = optionalString(input.provider);
      const domain = optionalString(input.domain) as ProviderDomain | undefined;
      const specs = providerId
        ? [getProviderCapability(providerId)].filter((provider): provider is NonNullable<typeof provider> => Boolean(provider))
        : domain
          ? providersForDomain(domain)
          : providerCapabilities;
      const availability = specs.map((provider) => checkProviderAvailability(provider));
      const report = {
        schema: "creative.pipeline.provider_availability.v1",
        generatedAt: new Date().toISOString(),
        provider: providerId ?? null,
        domain: domain ?? null,
        availability,
        policy: {
          rawProxy: false,
          typedOperationsOnly: true,
          artifactFirst: true,
          approvalForProjectWrites: true
        }
      };
      const artifact = await context.artifactStore.writeJson("providers/availability_report.json", report);
      return { ok: true, message: "Provider availability report written", artifacts: [artifact], data: report };
    }
  },
  {
    name: "provider.resolve_video_editor",
    description: "Resolve a safe video editor provider, preferring Premiere when available and CapCut for social fallback.",
    category: "provider",
    risk: "read",
    inputSchema: resolverSchema(),
    async execute(context, input) {
      return writeResolution(context, "video_editor", input, "providers/video_editor_resolution.json");
    }
  },
  {
    name: "provider.resolve_motion_engine",
    description: "Resolve a safe motion/render provider such as After Effects aerender/nexrender or Blender motion.",
    category: "provider",
    risk: "read",
    inputSchema: resolverSchema(),
    async execute(context, input) {
      return writeResolution(context, "motion_engine", input, "providers/motion_engine_resolution.json");
    }
  },
  {
    name: "provider.resolve_game_engine",
    description: "Resolve a safe game-engine provider for Roblox project QC and future Studio integration.",
    category: "provider",
    risk: "read",
    inputSchema: resolverSchema(),
    async execute(context, input) {
      return writeResolution(context, "game_engine", input, "providers/game_engine_resolution.json");
    }
  },
  {
    name: "provider.write_provider_report",
    description: "Write a combined provider strategy report for video, motion, and game workflows.",
    category: "provider",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", maxLength: 200 },
        includeUnavailable: { type: "boolean" }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const domains: ProviderDomain[] = ["video_editor", "motion_engine", "game_engine"];
      const resolutions = domains.map((domain) => resolveProvider(domain, { allowExperimental: true }));
      const report = {
        schema: "creative.pipeline.provider_report.v1",
        project: optionalString(input.project) ?? "creative-pipeline",
        generatedAt: new Date().toISOString(),
        resolutions,
        v1Scope: {
          stable: ["core", "asset_sourcing", "blender_qc", "premiere_media_qc", "dashboard_approval"],
          experimental: ["capcut_provider", "after_effects_render_provider", "roblox_read_only_qc"]
        },
        policy: {
          rawAppProxy: false,
          typedOperations: true,
          artifactCapture: true,
          postOperationQc: true,
          approvalGates: true
        }
      };
      const artifact = await context.artifactStore.writeJson("providers/provider_report.json", report);
      return { ok: true, message: "Provider report written", artifacts: [artifact], data: report };
    }
  }
];

function resolverSchema() {
  return {
    type: "object" as const,
    properties: {
      preferredProvider: { type: "string" },
      allowExperimental: { type: "boolean" },
      requireAvailable: { type: "boolean" }
    },
    additionalProperties: false
  };
}

async function writeResolution(
  context: Parameters<ToolDefinition["execute"]>[0],
  domain: ProviderDomain,
  input: Record<string, unknown>,
  relativePath: string
) {
  const resolution = resolveProvider(domain, {
    preferredProvider: optionalString(input.preferredProvider),
    allowExperimental: input.allowExperimental !== false,
    requireAvailable: Boolean(input.requireAvailable)
  });
  const artifact = await context.artifactStore.writeJson(relativePath, {
    schema: "creative.pipeline.provider_resolution.v1",
    generatedAt: new Date().toISOString(),
    ...resolution,
    policy: { rawProxy: false, typedOperationsOnly: true }
  });
  return {
    ok: Boolean(resolution.selected),
    message: resolution.selected ? `Provider selected: ${resolution.selected.provider}` : "No provider available",
    artifacts: [artifact],
    data: resolution
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
