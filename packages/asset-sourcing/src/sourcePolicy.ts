import type { AssetIntent, FalGenerationPolicy, SourcePlan, SourceProvider } from "./types.js";

export const SOURCE_PRIORITY: Record<AssetIntent, SourceProvider[]> = {
  specific_object: ["local_cache", "user_supplied", "sketchfab", "fal_hunyuan", "fal_hyper3d", "fal_meshy", "fal_tripo"],
  generic_furniture: ["local_cache", "user_supplied", "polyhaven", "sketchfab", "fal_hunyuan", "fal_meshy"],
  generic_prop: ["local_cache", "user_supplied", "polyhaven", "sketchfab", "fal_hunyuan", "fal_tripo"],
  environment_hdri: ["local_cache", "user_supplied", "polyhaven"],
  texture: ["local_cache", "user_supplied", "polyhaven"],
  material: ["local_cache", "user_supplied", "polyhaven", "fal_hunyuan"],
  character: ["local_cache", "user_supplied", "sketchfab", "fal_meshy", "fal_hyper3d", "fal_hunyuan"],
  vehicle: ["local_cache", "user_supplied", "sketchfab", "fal_hyper3d", "fal_hunyuan", "fal_meshy"],
  generated_concept: ["local_cache", "user_supplied", "fal_hunyuan", "fal_tripo", "fal_hyper3d", "fal_meshy"]
};

export function classifyAssetIntent(prompt: string, explicit?: unknown): AssetIntent {
  if (typeof explicit === "string" && explicit in SOURCE_PRIORITY) {
    return explicit as AssetIntent;
  }
  const text = prompt.toLowerCase();
  if (/\b(hdri|environment light|studio light|sky|sunset|overcast)\b/.test(text)) return "environment_hdri";
  if (/\b(texture|albedo|normal map|roughness|metallic|displacement)\b/.test(text)) return "texture";
  if (/\b(material|shader|pbr)\b/.test(text)) return "material";
  if (/\b(chair|table|sofa|desk|cabinet|shelf|bed|lamp)\b/.test(text)) return "generic_furniture";
  if (/\b(character|person|creature|mascot|avatar|humanoid)\b/.test(text)) return "character";
  if (/\b(car|vehicle|truck|bike|motorcycle|airplane|ship)\b/.test(text)) return "vehicle";
  if (/\b(concept|invent|generate|original|fantasy|sci-fi)\b/.test(text)) return "generated_concept";
  if (/\b(prop|tool|box|bottle|book|cup|plant)\b/.test(text)) return "generic_prop";
  return "specific_object";
}

export function normalizePolicy(value: unknown): FalGenerationPolicy {
  if (value === "candidate" || value === "force") return value;
  return "fallback_only";
}

export function buildSourcePlan(input: {
  prompt: string;
  intent?: unknown;
  style?: unknown;
  policy?: unknown;
  userSupplied?: boolean;
}): SourcePlan {
  const intent = classifyAssetIntent(input.prompt, input.intent);
  const policy = normalizePolicy(input.policy);
  const priority = SOURCE_PRIORITY[intent];
  return {
    schema: "creative.pipeline.asset_sourcing_plan.v1",
    prompt: input.prompt,
    intent,
    style: typeof input.style === "string" ? input.style : undefined,
    policy,
    priority,
    providers: {
      local_cache: { enabled: true, reason: "Always checked first for reproducibility and cost control." },
      user_supplied: { enabled: Boolean(input.userSupplied), reason: "User-supplied files or URLs override public search when present." },
      polyhaven: { enabled: priority.includes("polyhaven"), reason: "Preferred for CC0 HDRI, textures, materials, generic props, and furniture." },
      sketchfab: { enabled: priority.includes("sketchfab"), reason: "Preferred for specific objects, characters, vehicles, and broad model search with per-asset license capture." },
      fal: { enabled: priority.some((provider) => provider.startsWith("fal_")), reason: "Used only under the selected fallback/candidate/force generation policy." }
    },
    fallback: {
      provider: selectFalProvider(intent),
      model: selectFalModel(intent, false),
      smartTopology: intent !== "environment_hdri" && intent !== "texture"
    },
    guardrails: {
      fallbackOnlyDefault: policy === "fallback_only",
      serverSideFalKeyOnly: true,
      writeProvenance: true,
      requireFinalQc: true,
      noRawExternalProxy: true
    }
  };
}

export function selectFalProvider(intent: AssetIntent): SourceProvider {
  if (intent === "character") return "fal_meshy";
  if (intent === "vehicle") return "fal_hyper3d";
  return "fal_hunyuan";
}

export function selectFalModel(intent: AssetIntent, imageInput: boolean): string {
  if (intent === "character") return imageInput ? "fal-ai/meshy/v6/image-to-3d" : "fal-ai/meshy/v6/text-to-3d";
  if (intent === "vehicle") return "fal-ai/hyper3d/rodin/v2.5/text-to-3d";
  return imageInput ? "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d" : "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d";
}
