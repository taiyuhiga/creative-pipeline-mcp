import { readdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import { scoreCandidate } from "../assetScorer.js";
import type { AssetCandidate, AssetIntent, SourceProvider } from "../types.js";

const MODEL_EXTENSIONS = new Set([".glb", ".gltf", ".fbx", ".obj", ".hdr", ".exr", ".jpg", ".png"]);

export async function localCacheCandidates(input: {
  roots: string[];
  prompt: string;
  intent: AssetIntent;
  priority: SourceProvider[];
  style?: string;
  limit: number;
}): Promise<AssetCandidate[]> {
  const candidates: AssetCandidate[] = [];
  for (const root of input.roots) {
    for (const entry of await safeReadDir(root)) {
      const path = join(root, entry);
      const extension = extname(entry).toLowerCase();
      if (!MODEL_EXTENSIONS.has(extension)) continue;
      const format = extension.slice(1) as AssetCandidate["format"];
      const title = basename(entry, extension).replace(/[-_]/g, " ");
      candidates.push({
        id: `local:${path}`,
        provider: "local_cache",
        intent: input.intent,
        title,
        format,
        license: "Unknown",
        localPath: path,
        score: scoreCandidate({
          provider: "local_cache",
          providerPriority: input.priority,
          intent: input.intent,
          prompt: input.prompt,
          title,
          format,
          license: "Unknown",
          style: input.style
        })
      });
      if (candidates.length >= input.limit) return candidates;
    }
  }
  return candidates;
}

function safeReadDir(path: string): Promise<string[]> {
  return readdir(path).catch(() => []);
}
