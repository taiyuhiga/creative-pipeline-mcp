# Asset Sourcing Policy

Creative Pipeline MCP resolves assets through typed source plans, candidate scoring, provenance artifacts, and final QC. It does not expose raw external provider proxies.

## Priority

```text
0. local project cache
1. user-supplied file or URL
2. specific object: Sketchfab/Fab style search first
3. generic furniture or prop: Poly Haven first, then Sketchfab/Fab
4. HDRI: Poly Haven HDRI
5. texture/material: Poly Haven textures/materials
6. no acceptable candidate: fal 3D generation
7. generated/acquired output: smart topology, glTF optimization, Blender QC, provenance
```

## Public Tools

- `asset.resolve_source_plan`
- `asset.search_candidates`
- `asset.acquire_asset`
- `asset.generate_3d`
- `asset.postprocess_generated_asset`
- `asset.finalize_asset`
- `asset.write_provenance`
- `asset.acquire_or_generate`

## fal Guardrails

fal 3D generation is disabled unless explicitly enabled:

```bash
CREATIVE_MCP_ENABLE_FAL_3D=true
FAL_KEY=...
CREATIVE_MCP_FAL_MAX_CANDIDATES=3
CREATIVE_MCP_FAL_DEFAULT_POLICY=fallback_only
```

`FAL_KEY` must remain server-side. The default policy is `fallback_only`, meaning local, user-supplied, Poly Haven, and Sketchfab/Fab candidates are preferred before generated assets.

Supported model routes:

- text to 3D: Hunyuan Pro, Hyper3D Rodin, Meshy, Tripo
- image to 3D: Hunyuan Pro, Tripo, Meshy, Hyper3D
- postprocess: Hunyuan Smart Topology

## Provenance

Every selected asset writes:

- `artifacts/assets/selected_asset.json`
- `artifacts/assets/provenance.json`
- `artifacts/assets/license_manifest.json`

Remote download is disabled unless `CREATIVE_MCP_ENABLE_ASSET_DOWNLOAD=true`. Without that opt-in, tools write acquisition manifests and source URLs but do not fetch bytes.

## Final QC

Final asset packages must retain provenance and require `blender.validate_asset` or equivalent QC evidence before delivery.
