import { scoreCandidate } from "../assetScorer.js";
import type { AssetCandidate, AssetIntent, SourceProvider } from "../types.js";

export async function sketchfabCandidates(input: {
  prompt: string;
  intent: AssetIntent;
  priority: SourceProvider[];
  style?: string;
  limit: number;
}): Promise<AssetCandidate[]> {
  if (!["specific_object", "generic_furniture", "generic_prop", "character", "vehicle"].includes(input.intent)) {
    return [];
  }
  if (process.env.CREATIVE_MCP_ENABLE_SKETCHFAB_API === "true" && process.env.SKETCHFAB_TOKEN) {
    const live = await liveSketchfabCandidates(input).catch((error: unknown) => {
      if (process.env.CREATIVE_MCP_ASSET_DEBUG === "true") console.error(error);
      return [];
    });
    if (live.length > 0) return live.slice(0, input.limit);
  }
  const title = `${input.prompt} Sketchfab search`;
  const url = `https://sketchfab.com/search?features=downloadable&type=models&q=${encodeURIComponent(input.prompt)}`;
  const candidate: AssetCandidate = {
    id: `sketchfab:${slug(input.prompt)}:${input.intent}`,
    provider: "sketchfab",
    intent: input.intent,
    title,
    description: "Sketchfab search candidate. Per-asset license and downloadability must be captured before acquisition.",
    format: "glb",
    license: "Unknown",
    url,
    requiresAuth: true,
    score: scoreCandidate({
      provider: "sketchfab",
      providerPriority: input.priority,
      intent: input.intent,
      prompt: input.prompt,
      title,
      format: "glb",
      license: "Unknown",
      style: input.style
    })
  };
  return [candidate].slice(0, input.limit);
}

async function liveSketchfabCandidates(input: {
  prompt: string;
  intent: AssetIntent;
  priority: SourceProvider[];
  style?: string;
  limit: number;
}): Promise<AssetCandidate[]> {
  const baseUrl = process.env.CREATIVE_MCP_SKETCHFAB_API_BASE_URL ?? "https://api.sketchfab.com/v3";
  const url = `${baseUrl.replace(/\/$/, "")}/search?type=models&downloadable=true&archives_flavours=true&q=${encodeURIComponent(input.prompt)}`;
  const response = await fetchJson<{ results?: Array<Record<string, unknown>> }>(url);
  return (response.results ?? []).slice(0, input.limit).map((item) => {
    const uid = String(item.uid ?? item.id ?? slug(String(item.name ?? input.prompt)));
    const title = String(item.name ?? item.title ?? input.prompt);
    const license = sketchfabLicense(item.license);
    const candidate: AssetCandidate = {
      id: `sketchfab:${uid}`,
      provider: "sketchfab",
      intent: input.intent,
      title,
      description: typeof item.description === "string" ? item.description.slice(0, 500) : "Sketchfab live API candidate.",
      format: "glb",
      license,
      url: typeof item.viewerUrl === "string" ? item.viewerUrl : `https://sketchfab.com/3d-models/${uid}`,
      downloadUrl: `${baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(uid)}/download`,
      requiresAuth: true,
      metadata: {
        uid,
        api: "sketchfab",
        downloadable: item.isDownloadable ?? true,
        rawLicense: item.license
      },
      score: scoreCandidate({
        provider: "sketchfab",
        providerPriority: input.priority,
        intent: input.intent,
        prompt: input.prompt,
        title,
        format: "glb",
        license,
        style: input.style
      })
    };
    return candidate;
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.CREATIVE_MCP_ASSET_FETCH_TIMEOUT_MS ?? 10000));
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Authorization": `Token ${process.env.SKETCHFAB_TOKEN ?? ""}`,
        "Accept": "application/json",
        "User-Agent": "creative-pipeline-mcp/asset-sourcing"
      }
    });
    if (!response.ok) throw new Error(`Sketchfab API failed: ${response.status} ${response.statusText}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

function sketchfabLicense(value: unknown): string {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const label = record.label ?? record.slug ?? record.fullName;
    if (typeof label === "string") return label;
  }
  if (typeof value === "string") return value;
  return "Unknown";
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "asset";
}
