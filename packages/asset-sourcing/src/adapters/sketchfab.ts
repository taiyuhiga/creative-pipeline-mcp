import { scoreCandidate } from "../assetScorer.js";
import type { AssetCandidate, AssetIntent, SourceProvider } from "../types.js";

export function sketchfabCandidates(input: {
  prompt: string;
  intent: AssetIntent;
  priority: SourceProvider[];
  style?: string;
  limit: number;
}): AssetCandidate[] {
  if (!["specific_object", "generic_furniture", "generic_prop", "character", "vehicle"].includes(input.intent)) {
    return [];
  }
  const title = `${input.prompt} Sketchfab/Fab search`;
  const url = `https://sketchfab.com/search?features=downloadable&type=models&q=${encodeURIComponent(input.prompt)}`;
  const candidate: AssetCandidate = {
    id: `sketchfab:${slug(input.prompt)}:${input.intent}`,
    provider: "sketchfab",
    intent: input.intent,
    title,
    description: "Sketchfab/Fab search candidate. Per-asset license and downloadability must be captured before acquisition.",
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

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "asset";
}
