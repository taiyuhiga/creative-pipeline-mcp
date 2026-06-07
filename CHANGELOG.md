# Changelog

## 0.2.18-alpha.0

### Added

- Added v1 scope documentation that separates stable v1 surfaces from experimental adapters and live editing flows.
- Added typed delivery profiles for Premiere and Blender outputs, including YouTube 4K, Shorts, podcast, captioned social, game-ready GLB, marketplace asset, high-quality preview, and final EXR deliveries.
- Added typed quality presets for ProRes, YouTube 4K, Shorts, game-ready GLB, USD/VFX handoff, and Cycles final EXR outputs.
- Added example profile JSON files under `examples/profiles`.
- Added Premiere external MCP reference documentation that records useful design ideas while rejecting direct external MCP proxying.

### Changed

- Updated external MCP adapter guidance so `dcc-mcp-blender` remains optional, disabled by default, bounded by allowlisted operations, and behind local QC and artifact capture.
- Updated release readiness checks to require v1 scope, delivery profile, quality preset, Premiere MCP reference, and profile example documentation.
- Exported delivery and quality profile catalogs from the core package.

### Verified

- CI run `27083958219` passed with Node.js 20/22/24 unit tests, package dry-run, release readiness, v1 freeze checks, Windows smoke, Premiere QC E2E, optional adapter checks, optional Blender E2E, and hosted Windows Blender E2E.
- Local release gates passed for build, tests, schema checks, v1 freeze checks, release readiness, npm pack dry-run, and npm install smoke testing.

## 0.2.17-alpha.0

### Added

- Added hosted Windows Blender E2E CI with Chocolatey Blender install, `BLENDER_BIN` resolution, preview render, GLB optimization, and asset validation.
- Added a workflow-dispatch Windows Premiere E2E workflow for interactive self-hosted Windows runners with Premiere installed.
- Added `scripts/wait-premiere-e2e-status.mjs` and `npm run wait:premiere-e2e` for real CEP status collection.
- Added `npm run check:v1-freeze` to gate tool names, input schemas, `structuredContent`, QC report fixtures, artifact layout, and Premiere CEP status fixtures.
- Added stricter release readiness coverage for v1 freeze and Windows Premiere E2E support files.

### Changed

- Updated the project delivery example with a `--no-simulate` mode for live Premiere panel processing.
- Generated a valid short MP4 sample for Premiere project delivery when FFmpeg is available.
- Documented Windows + Premiere as an external interactive runner blocker rather than a hosted CI capability.
- Marked v1 stable publish and v1 GitHub Release work as blocked until Windows Premiere evidence exists.

### Verified

- CI run `27082846836` passed with Node.js 20/22/24 unit tests, package dry-run, release readiness, v1 freeze checks, Windows smoke, Premiere QC E2E, and Windows Blender E2E.
- CI run `27082352428` passed the Windows Blender E2E job after resolving the Chocolatey-installed Blender path.
- Local release gates passed for schema checks, v1 freeze checks, release readiness, npm pack dry-run, and simulated Premiere E2E status waiting.

### Known Limitations

- Windows + Premiere live E2E still requires an interactive self-hosted Windows runner with Premiere installed and labels `self-hosted`, `Windows`, and `premiere`.
- `#20`, `#86`, and `#107` remain blocked until that runner produces successful CEP status files for `build_timeline_from_otio`, `apply_brand_package`, and `export_sequence`.
- npm stable release and v1.0 GitHub Release remain blocked until the Windows Premiere verification decision is resolved.

## 0.2.16-alpha.0

### Added

- Added stricter public tool schema snapshots and release-readiness checks.
- Added real adapter scaffolds for Blender, Premiere CEP, optional media analysis, and packaging.
- Added Dashboard approval, artifact preview, adapter, QC, CEP status, gallery, job retry, and rerun-history views.
- Added Premiere CEP packaging, unsigned verification, optional ZXP signing, install fallback, and status normalization.
- Added Blender GLB E2E, Premiere QC E2E, and project-delivery example workflows.
- Added Windows smoke CI and manual Windows Blender/Premiere verification docs.
