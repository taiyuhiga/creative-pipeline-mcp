import type { AssetCandidate, AssetProvenance } from "./types.js";

export function provenanceFromCandidate(candidate: AssetCandidate): AssetProvenance {
  return {
    schema: "creative.pipeline.asset_provenance.v1",
    sourceProvider: candidate.provider,
    sourceId: candidate.id,
    title: candidate.title,
    license: candidate.license,
    sourceUrl: candidate.url,
    downloadUrl: candidate.downloadUrl,
    generated: Boolean(candidate.generated),
    acquiredAt: new Date().toISOString(),
    notes: [
      "Provenance must remain attached to the asset package.",
      "Run blender.validate_asset or equivalent QC before final delivery."
    ]
  };
}
