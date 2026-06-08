import type { AssetCandidate, AssetCandidateScore, AssetIntent, SourceProvider } from "./types.js";

const LICENSE_SAFETY: Record<string, number> = {
  CC0: 1,
  "CC-BY": 0.82,
  "CC-BY-SA": 0.62,
  "Royalty-Free": 0.7,
  "Generated": 0.78,
  Unknown: 0.25
};

const FORMAT_SCORE: Record<string, number> = {
  glb: 1,
  gltf: 0.92,
  fbx: 0.72,
  obj: 0.62,
  exr: 0.95,
  hdr: 0.95,
  jpg: 0.5,
  png: 0.5,
  material: 0.82,
  unknown: 0.2
};

export function scoreCandidate(input: {
  provider: SourceProvider;
  providerPriority: SourceProvider[];
  intent: AssetIntent;
  prompt: string;
  title: string;
  format: AssetCandidate["format"];
  license: string;
  style?: string;
  generated?: boolean;
}): AssetCandidateScore {
  const priorityIndex = input.providerPriority.indexOf(input.provider);
  const sourcePriority = priorityIndex < 0 ? 0.1 : 1 - priorityIndex / Math.max(input.providerPriority.length, 1);
  const promptTerms = tokenize(input.prompt);
  const titleTerms = tokenize(input.title);
  const semanticMatch = promptTerms.length === 0 ? 0.5 : promptTerms.filter((term) => titleTerms.includes(term)).length / promptTerms.length;
  const styleScore = input.style ? (input.title.toLowerCase().includes(input.style.toLowerCase()) ? 1 : 0.55) : 0.7;
  const licenseSafety = LICENSE_SAFETY[input.license] ?? LICENSE_SAFETY.Unknown;
  const formatScore = FORMAT_SCORE[input.format] ?? FORMAT_SCORE.unknown;
  const qcScore = input.generated ? 0.62 : 0.72;
  const textureScore = input.intent === "texture" || input.intent === "material" ? 0.86 : 0.68;
  const costScore = input.generated ? 0.45 : 0.92;
  const finalScore = weighted({
    semanticMatch,
    sourcePriority,
    licenseSafety,
    formatScore,
    qcScore,
    textureScore,
    styleScore,
    costScore
  });
  return {
    semanticMatch,
    sourcePriority,
    licenseSafety,
    formatScore,
    qcScore,
    textureScore,
    styleScore,
    costScore,
    finalScore
  };
}

export function sortCandidates(candidates: AssetCandidate[]): AssetCandidate[] {
  return [...candidates].sort((left, right) => right.score.finalScore - left.score.finalScore);
}

function tokenize(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9_ -]/g, " ").split(/\s+/).filter((term) => term.length > 2);
}

function weighted(score: Omit<AssetCandidateScore, "finalScore">): number {
  return round(
    score.semanticMatch * 0.2
    + score.sourcePriority * 0.18
    + score.licenseSafety * 0.17
    + score.formatScore * 0.14
    + score.qcScore * 0.12
    + score.textureScore * 0.08
    + score.styleScore * 0.06
    + score.costScore * 0.05
  );
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
