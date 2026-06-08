# v1 Scope

This project is a QC-first creative pipeline, not a raw Blender or Premiere remote-control proxy.

## Stable v1 Scope

The v1 stable claim is limited to the surfaces that can be verified through typed operations, artifacts, QC reports, approval policy, and CI or local evidence:

- `creative-mcp-core` registry, router, approval policy, artifact store, schema validation, and structured tool result shape
- Provider Registry availability, provider resolution, and provider report tools as planning/reporting surfaces
- Dashboard artifact, QC, approval, adapter, CEP status, gallery, retry, and rerun views
- Blender GLB/glTF metadata QC, preview rendering, optimization, basic repair, and game-ready artifact planning
- Premiere media QC, delivery QC, subtitle QC, brand package schema, export planning, typed CEP command generation, CEP queue/status fixtures, and project-delivery command generation
- API tool schema snapshot, v1 freeze gate, artifact layout docs, QC report schema docs, and CEP status schema docs
- npm package, release assets, CI gates, and trusted-publishing workflow

## Experimental v1 Surface

These surfaces remain available for alpha/beta use, but should be described as experimental until additional evidence exists:

- Premiere live CEP editing and export execution, including trim, split, move, marker, and speed changes inside a real Premiere project
- Blender bridge queue/status worker execution
- WhisperX, PySceneDetect, pyloudnorm, FFmpeg VMAF, `gltfpack`, and other optional external adapters
- GPL-separated adapter manifests
- signed ZXP distribution with a trusted production certificate
- experimental external Blender MCP adapter tools for bounded health, import, preview, export, transform, and validate calls
- CapCut social draft planning, copy-on-write draft manifests, and draft QC
- After Effects render plans, aerender/nexrender queue manifests, and motion QC
- Roblox read-only project inspection, Luau QC, Rojo/Wally/Selene/Stylua command manifests, and project reports

## Known External Blocker

Windows + Premiere live E2E is required for a full cross-platform Premiere v1 claim, but it currently requires an interactive self-hosted Windows runner with Premiere installed. Hosted GitHub runners cannot launch Premiere or CEP panels.

Until that runner exists and produces successful status JSON for `build_timeline_from_otio`, `apply_brand_package`, and `export_sequence`, Windows + Premiere remains outside the current stable v1 claim.

## Non-Goals

- Do not expose raw `bpy` execution as a default production tool.
- Do not expose raw ExtendScript or QE DOM execution as a default production tool.
- Do not direct-proxy external Blender or Premiere MCP servers to users.
- Do not direct-proxy CapCut, After Effects, Roblox Studio, or external MCP APIs as raw app control.
- Do not expose encrypted draft bypasses, raw JSX, Roblox executor/client exploit tools, or license bypasses.
- Do not mark pre-release packages as stable v1.

## Release Decision

Use alpha/beta releases while Windows + Premiere is blocked or while optional adapters are still changing. Tag `1.0.0` only after the stable scope above is complete, documented, and verified, and after the release notes clearly identify any remaining experimental surfaces.
