import { scoreCandidate } from "../assetScorer.js";
import type { AssetCandidate, AssetIntent, SourceProvider } from "../types.js";

export function polyhavenCandidates(input: {
  prompt: string;
  intent: AssetIntent;
  priority: SourceProvider[];
  style?: string;
  limit: number;
}): AssetCandidate[] {
  if (!["generic_furniture", "generic_prop", "environment_hdri", "texture", "material"].includes(input.intent)) {
    return [];
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

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "asset";
}
