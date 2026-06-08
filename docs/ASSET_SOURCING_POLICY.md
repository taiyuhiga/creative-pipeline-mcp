# Asset Sourcing Policy

Creative Pipeline MCP resolves assets through typed source plans, candidate scoring, provenance artifacts, and final QC. It does not expose raw external provider proxies.

## Priority

```text
0. local project cache
1. user-supplied file or URL
2. specific object: Sketchfab search first; Fab assets can be recorded through user-supplied URLs
3. generic furniture or prop: Poly Haven first, then Sketchfab
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

`FAL_KEY` must remain server-side. The default policy is `fallback_only`, meaning local, user-supplied, Poly Haven, and Sketchfab candidates are preferred before generated assets.

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

## Remote Provider Search

Remote provider API calls are disabled by default so CI and local planning remain deterministic.

Enable Poly Haven API search:

```bash
CREATIVE_MCP_ENABLE_POLYHAVEN_API=true
CREATIVE_MCP_POLYHAVEN_API_BASE_URL=https://api.polyhaven.com
CREATIVE_MCP_POLYHAVEN_FETCH_FILES=true
```

Poly Haven candidates are treated as CC0 and are preferred for HDRI, textures/materials, and generic furniture/props. When `CREATIVE_MCP_POLYHAVEN_FETCH_FILES=true`, the adapter also inspects the files endpoint and records a candidate `downloadUrl` when it can identify a suitable file.

Enable Sketchfab API search:

```bash
CREATIVE_MCP_ENABLE_SKETCHFAB_API=true
SKETCHFAB_TOKEN=...
CREATIVE_MCP_SKETCHFAB_API_BASE_URL=https://api.sketchfab.com/v3
```

Sketchfab search and downloads require `SKETCHFAB_TOKEN`. The adapter records the per-asset license returned by the API and keeps the Download API URL as the candidate `downloadUrl`. Asset download still requires `CREATIVE_MCP_ENABLE_ASSET_DOWNLOAD=true`.

Network calls use `CREATIVE_MCP_ASSET_FETCH_TIMEOUT_MS`, defaulting to 10000 ms.

Fab does not have a directly supported automated search/download adapter in this release. Fab assets should be passed as user-supplied URLs or files and recorded with `asset.acquire_asset` or `asset.write_provenance` until a stable public provider API is available.

## Final QC

Final asset packages must retain provenance and require `blender.validate_asset` or equivalent QC evidence before delivery.
