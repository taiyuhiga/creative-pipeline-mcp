import { scoreCandidate } from "../assetScorer.js";
import type { AssetCandidate, AssetIntent, SourceProvider } from "../types.js";

export async function polyhavenCandidates(input: {
  prompt: string;
  intent: AssetIntent;
  priority: SourceProvider[];
  style?: string;
  limit: number;
}): Promise<AssetCandidate[]> {
  if (!["generic_furniture", "generic_prop", "environment_hdri", "texture", "material"].includes(input.intent)) {
    return [];
  }
  if (process.env.CREATIVE_MCP_ENABLE_POLYHAVEN_API === "true") {
    const live = await livePolyhavenCandidates(input).catch((error: unknown) => {
      if (process.env.CREATIVE_MCP_ASSET_DEBUG === "true") console.error(error);
      return [];
    });
    if (live.length > 0) return live.slice(0, input.limit);
  }
  const format = input.intent === "environment_hdri" ? "hdr" : input.intent === "texture" || input.intent === "material" ? "material" : "glb";
  const title = `${input.prompt} Poly Haven ${input.intent}`;
  const url = `https://polyhaven.com/assets?q=${encodeURIComponent(input.prompt)}`;
  const candidates: AssetCandidate[] = [{
    id: `polyhaven:${slug(input.prompt)}:${input.intent}`,
    provider: "polyhaven",
    intent: input.intent,
    title,
    description: "Poly Haven candidate placeholder. Enable explicit download handling before acquiring remote bytes.",
    format,
    license: "CC0",
    url,
    downloadUrl: undefined,
    requiresAuth: false,
    score: scoreCandidate({
      provider: "polyhaven",
      providerPriority: input.priority,
      intent: input.intent,
      prompt: input.prompt,
      title,
      format,
      license: "CC0",
      style: input.style
    })
  }];
  return candidates.slice(0, input.limit);
}

async function livePolyhavenCandidates(input: {
  prompt: string;
  intent: AssetIntent;
  priority: SourceProvider[];
  style?: string;
  limit: number;
}): Promise<AssetCandidate[]> {
  const type = polyhavenType(input.intent);
  const baseUrl = process.env.CREATIVE_MCP_POLYHAVEN_API_BASE_URL ?? "https://api.polyhaven.com";
  const url = `${baseUrl.replace(/\/$/, "")}/assets?t=${encodeURIComponent(type)}`;
  const assets = await fetchJson<Record<string, Record<string, unknown>>>(url);
  const matches = Object.entries(assets)
    .map(([id, asset]) => ({ id, asset, rank: matchRank(input.prompt, id, asset) }))
    .filter((entry) => entry.rank > 0)
    .sort((left, right) => right.rank - left.rank)
    .slice(0, input.limit);
  const candidates: AssetCandidate[] = [];
  for (const entry of matches) {
    const title = String(entry.asset.name ?? entry.asset.title ?? entry.id.replace(/_/g, " "));
    const format = input.intent === "environment_hdri" ? "hdr" : input.intent === "texture" || input.intent === "material" ? "material" : "glb";
    const files = process.env.CREATIVE_MCP_POLYHAVEN_FETCH_FILES === "true"
      ? await fetchJson<Record<string, unknown>>(`${baseUrl.replace(/\/$/, "")}/files/${encodeURIComponent(entry.id)}`).catch(() => undefined)
      : undefined;
    const downloadUrl = files ? findPolyhavenDownloadUrl(files, format) : undefined;
    candidates.push({
      id: `polyhaven:${entry.id}`,
      provider: "polyhaven",
      intent: input.intent,
      title,
      description: typeof entry.asset.categories === "string" ? entry.asset.categories : "Poly Haven live API candidate.",
      format,
      license: "CC0",
      url: `https://polyhaven.com/a/${entry.id}`,
      downloadUrl,
      requiresAuth: false,
      metadata: { id: entry.id, type, rank: entry.rank, api: "polyhaven", filesFetched: Boolean(files) },
      score: scoreCandidate({
        provider: "polyhaven",
        providerPriority: input.priority,
        intent: input.intent,
        prompt: input.prompt,
        title,
        format,
        license: "CC0",
        style: input.style
      })
    });
  }
  return candidates;
}

function polyhavenType(intent: AssetIntent): "hdris" | "textures" | "models" {
  if (intent === "environment_hdri") return "hdris";
  if (intent === "texture" || intent === "material") return "textures";
  return "models";
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.CREATIVE_MCP_ASSET_FETCH_TIMEOUT_MS ?? 10000));
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "creative-pipeline-mcp/asset-sourcing",
        "Accept": "application/json"
      }
    });
    if (!response.ok) throw new Error(`Poly Haven API failed: ${response.status} ${response.statusText}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

function matchRank(prompt: string, id: string, asset: Record<string, unknown>): number {
  const haystack = [
    id,
    asset.name,
    asset.title,
    Array.isArray(asset.categories) ? asset.categories.join(" ") : asset.categories,
    Array.isArray(asset.tags) ? asset.tags.join(" ") : asset.tags
  ].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
  const terms = prompt.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
  if (terms.length === 0) return 1;
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function findPolyhavenDownloadUrl(files: Record<string, unknown>, format: AssetCandidate["format"]): string | undefined {
  const preferred = format === "glb" ? ["glb", "gltf", "fbx", "obj"] : format === "hdr" ? ["hdr", "exr"] : ["png", "jpg", "jpeg"];
  const stack: unknown[] = [files];
  while (stack.length) {
    const value = stack.pop();
    if (!value || typeof value !== "object") continue;
    for (const [key, nested] of Object.entries(value)) {
      if (typeof nested === "string" && /^https?:\/\//.test(nested) && preferred.some((ext) => key.toLowerCase().includes(ext) || nested.toLowerCase().includes(`.${ext}`))) {
        return nested;
      }
      if (nested && typeof nested === "object") stack.push(nested);
    }
  }
  return undefined;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "asset";
}
