export type AssetIntent =
  | "specific_object"
  | "generic_furniture"
  | "generic_prop"
  | "environment_hdri"
  | "texture"
  | "material"
  | "character"
  | "vehicle"
  | "generated_concept";

export type SourceProvider =
  | "local_cache"
  | "user_supplied"
  | "polyhaven"
  | "sketchfab"
  | "fal_hunyuan"
  | "fal_tripo"
  | "fal_hyper3d"
  | "fal_meshy";

export type FalGenerationPolicy = "fallback_only" | "candidate" | "force";

export interface AssetCandidateScore {
  semanticMatch: number;
  sourcePriority: number;
  licenseSafety: number;
  formatScore: number;
  qcScore: number;
  textureScore: number;
  styleScore: number;
  costScore: number;
  finalScore: number;
}

export interface AssetCandidate {
  id: string;
  provider: SourceProvider;
  intent: AssetIntent;
  title: string;
  description?: string;
  format: "glb" | "gltf" | "fbx" | "obj" | "hdr" | "exr" | "jpg" | "png" | "material" | "unknown";
  license: string;
  url?: string;
  downloadUrl?: string;
  localPath?: string;
  requiresAuth?: boolean;
  generated?: boolean;
  metadata?: Record<string, unknown>;
  score: AssetCandidateScore;
}

export interface SourcePlan {
  schema: "creative.pipeline.asset_sourcing_plan.v1";
  prompt: string;
  intent: AssetIntent;
  style?: string;
  policy: FalGenerationPolicy;
  priority: SourceProvider[];
  providers: Record<string, { enabled: boolean; reason: string }>;
  fallback: {
    provider: SourceProvider;
    model: string;
    smartTopology: boolean;
  };
  guardrails: {
    fallbackOnlyDefault: boolean;
    serverSideFalKeyOnly: boolean;
    writeProvenance: boolean;
    requireFinalQc: boolean;
    noRawExternalProxy: boolean;
  };
}

export interface AssetProvenance {
  schema: "creative.pipeline.asset_provenance.v1";
  sourceProvider: SourceProvider;
  sourceId: string;
  title: string;
  license: string;
  sourceUrl?: string;
  downloadUrl?: string;
  generated: boolean;
  acquiredAt: string;
  notes: string[];
}
