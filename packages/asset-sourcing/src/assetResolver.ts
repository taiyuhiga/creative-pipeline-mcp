import { sortCandidates } from "./assetScorer.js";
import { falCandidates } from "./adapters/fal3d.js";
import { localCacheCandidates } from "./adapters/localCache.js";
import { polyhavenCandidates } from "./adapters/polyhaven.js";
import { sketchfabCandidates } from "./adapters/sketchfab.js";
import { buildSourcePlan } from "./sourcePolicy.js";
import type { AssetCandidate, SourcePlan } from "./types.js";

export async function resolveAssetCandidates(input: {
  prompt: string;
  intent?: unknown;
  style?: unknown;
  policy?: unknown;
  userSuppliedPath?: unknown;
  userSuppliedUrl?: unknown;
  workspaceRoots: string[];
  maxCandidates: number;
}): Promise<{ plan: SourcePlan; candidates: AssetCandidate[] }> {
  const userSupplied = typeof input.userSuppliedPath === "string" || typeof input.userSuppliedUrl === "string";
  const plan = buildSourcePlan({
    prompt: input.prompt,
    intent: input.intent,
    style: input.style,
    policy: input.policy,
    userSupplied
  });
  const limit = Math.max(1, Math.min(input.maxCandidates, 20));
  const candidates: AssetCandidate[] = [];
  if (typeof input.userSuppliedPath === "string") {
    candidates.push(userSuppliedCandidate(plan, input.userSuppliedPath, "localPath"));
  }
  if (typeof input.userSuppliedUrl === "string") {
    candidates.push(userSuppliedCandidate(plan, input.userSuppliedUrl, "url"));
  }
  candidates.push(...await localCacheCandidates({
    roots: input.workspaceRoots,
    prompt: input.prompt,
    intent: plan.intent,
    priority: plan.priority,
    style: plan.style,
    limit
  }));
  candidates.push(...await polyhavenCandidates({
    prompt: input.prompt,
    intent: plan.intent,
    priority: plan.priority,
    style: plan.style,
    limit
  }));
  candidates.push(...await sketchfabCandidates({
    prompt: input.prompt,
    intent: plan.intent,
    priority: plan.priority,
    style: plan.style,
    limit
  }));
  if (plan.policy === "candidate" || plan.policy === "force" || candidates.length === 0) {
    candidates.push(...falCandidates({
      prompt: input.prompt,
      intent: plan.intent,
      priority: plan.priority,
      style: plan.style,
      imageInput: false,
      limit: 1
    }));
  }
  return { plan, candidates: sortCandidates(candidates).slice(0, limit) };
}

function userSuppliedCandidate(plan: SourcePlan, value: string, kind: "localPath" | "url"): AssetCandidate {
  const title = kind === "localPath" ? value.split(/[\\/]/).pop() ?? "user asset" : value;
  return {
    id: `user_supplied:${value}`,
    provider: "user_supplied",
    intent: plan.intent,
    title,
    format: inferFormat(value),
    license: "User-Supplied",
    localPath: kind === "localPath" ? value : undefined,
    url: kind === "url" ? value : undefined,
    downloadUrl: kind === "url" ? value : undefined,
    score: {
      semanticMatch: 1,
      sourcePriority: 1,
      licenseSafety: 0.6,
      formatScore: 0.9,
      qcScore: 0.7,
      textureScore: 0.7,
      styleScore: 0.7,
      costScore: 1,
      finalScore: 0.82
    }
  };
}

function inferFormat(path: string): AssetCandidate["format"] {
  const lower = path.toLowerCase();
  if (lower.endsWith(".glb")) return "glb";
  if (lower.endsWith(".gltf")) return "gltf";
  if (lower.endsWith(".fbx")) return "fbx";
  if (lower.endsWith(".obj")) return "obj";
  if (lower.endsWith(".hdr")) return "hdr";
  if (lower.endsWith(".exr")) return "exr";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpg";
  if (lower.endsWith(".png")) return "png";
  return "unknown";
}
