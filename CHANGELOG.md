# Changelog

## 0.3.7-alpha.0

### Added

- Added `roblox.prepare_studio_mcp_session` for official Roblox Studio MCP stdio session plans without connecting to Studio.
- Added Roblox Studio MCP client config artifacts with raw Studio proxy, executor, and default publish guardrails.
- Added simulator and test coverage for `roblox/studio_mcp_session_plan.json` and `roblox/studio_mcp_client_config.json`.

## 0.3.6-alpha.0

### Added

- Added `ae.prepare_render_execution` for approved external-runner render plans without executing commands.
- Added argv-array-only After Effects execution plan artifacts with shell-string and raw JSX guardrails.
- Added simulator and test coverage for `after-effects/render_execution_plan.json`.

## 0.3.5-alpha.0

### Added

- Added `roblox.collect_studio_evidence` for Roblox Studio status/place evidence without raw Studio proxying or publish behavior.
- Added simulator and test coverage for Roblox Studio evidence artifacts.
- Added artifact/docs coverage for `roblox/studio_evidence.json`.

## 0.3.4-alpha.0

### Added

- Added `ae.collect_render_evidence` for After Effects render status/output evidence without raw JSX or license-bypass behavior.
- Added simulator and test coverage for After Effects render evidence artifacts.
- Added artifact/docs coverage for `after-effects/render_evidence.json`.

## 0.3.3-alpha.0

### Added

- Added `video.create_edit`, a provider-aware edit package tool that prefers Premiere and writes CapCut fallback draft artifacts when Premiere is unavailable.
- Added CapCut fallback draft plan, manifest, and QC artifacts with copy-on-write policy and no live app execution claims.
- Added test coverage for the Premiere-to-CapCut fallback path.

## 0.3.2-alpha.0

### Added

- Added `npm run simulate:providers` for deterministic Provider Registry, CapCut, After Effects, Roblox, and Director workflow simulation.
- Added provider workflow simulation docs and a sample simulation artifact.
- Added test coverage for provider workflow simulation artifacts and safety policy evidence.

### Changed

- Expanded release-readiness checks to require the provider simulator script, docs, and sample artifact.

## 0.3.1-alpha.0

### Added

- Added Dashboard provider status visibility for Provider Registry, CapCut, After Effects, and Roblox artifacts.
- Added Dashboard retry/rerun coverage for provider, CapCut, After Effects, and Roblox tools.

### Changed

- Added provider packages as Dashboard dependencies so approved provider reruns work from the local review surface.

## 0.3.0-alpha.0

### Added

- Added Provider Registry tools for app availability, video editor resolution, motion engine resolution, game engine resolution, and provider reports.
- Added experimental `@creative-pipeline-mcp/capcut-social-mcp` with CapCut availability, copy-on-write draft planning, draft manifests, social draft macro artifacts, and draft QC.
- Added experimental `@creative-pipeline-mcp/after-effects-mcp` with After Effects availability, render plans, aerender/nexrender queue manifests, frame preview plans, render status, and motion QC.
- Added experimental `@creative-pipeline-mcp/roblox-pro-mcp` with Roblox availability, project inspection, place-tree reports, script indexing, Luau QC, Rojo/Wally/Selene/Stylua command manifests, and combined project reports.
- Added Director provider workflow plans for social videos, motion packages, Roblox features, and Roblox trailers.
- Added app integration, provider registry, CapCut, After Effects, and Roblox docs.

### Changed

- Expanded the public API schema snapshot and npm package exports for provider packages.
- Kept CapCut, After Effects, Roblox, external Blender MCP, and live Premiere CEP execution outside the stable v1 scope.

## 0.2.27-alpha.0

### Added

- Added `asset.ingest_generated_result` to extract generated model, preview, texture, and archive URLs from fal-style responses.
- Added explicit download gating for generated outputs into `artifacts/assets/generated/`.
- Added generated-output provenance, license manifest, and postprocess/QC handoff artifacts.

## 0.2.26-alpha.0

### Changed

- Added opt-in live Poly Haven API search with deterministic fallback candidates when remote API access is disabled or unavailable.
- Added opt-in authenticated Sketchfab Data API search with per-asset license capture and Download API URL recording.
- Added remote provider environment-variable docs and mock API test coverage for Poly Haven and Sketchfab search paths.

## 0.2.25-alpha.0

### Added

- Added `@creative-pipeline-mcp/asset-sourcing` with typed source planning, candidate scoring, provenance, acquisition manifests, fal 3D generation requests, and final asset package manifests.
- Added public asset tools: `asset.resolve_source_plan`, `asset.search_candidates`, `asset.acquire_asset`, `asset.generate_3d`, `asset.postprocess_generated_asset`, `asset.finalize_asset`, `asset.write_provenance`, and `asset.acquire_or_generate`.
- Added `docs/ASSET_SOURCING_POLICY.md`, asset artifact schema docs, and an `examples/asset-sourcing-plan.mjs` example.

### Changed

- Expanded the public API schema snapshot from 63 to 71 tools.
- Added `@fal-ai/client` as the fal 3D generation client dependency while keeping generation disabled unless `CREATIVE_MCP_ENABLE_FAL_3D=true` and server-side `FAL_KEY` are configured.

## 0.2.24-alpha.0

### Changed

- Updated the roadmap to treat `v0.2.23-alpha.0` as shipped and to keep future alpha releases on the npm `alpha` dist-tag until v1.
- Refreshed the npm publish workflow dispatch example tag for the current alpha release train.
- Clarified the remaining GitHub issues with explicit blocker reasons, required evidence, and current alpha release state.

## 0.2.23-alpha.0

### Changed

- Rechecked `dcc-mcp-blender` release metadata and updated `docs/EXTERNAL_MCP_ADAPTERS.md` from `v0.1.11` to `v0.1.13`, published on 2026-06-08.
- Kept the external Blender MCP adapter policy unchanged: optional, disabled by default, bounded by typed macro operations, and never exposed as a raw external proxy.

## 0.2.22-alpha.0

### Added

- Expanded the experimental external Blender MCP adapter from the initial health/preview/export surface to the full bounded macro set: `blender.external_import_asset`, `blender.external_render_preview`, `blender.external_export_asset`, `blender.external_apply_transform`, and `blender.external_validate_scene`.
- Added env-overridable external tool bindings for import, transform, and validate while keeping runtime users unable to select arbitrary external tool names.
- Added simulator coverage for import, preview, export, transform, and validate JSON-RPC calls.

### Changed

- Updated external Blender MCP docs, README, API tools docs, v1 scope docs, and schema snapshot for the complete bounded macro surface.
- Expanded the public tool schema snapshot from 60 to 63 tools.

## 0.2.21-alpha.0

### Added

- Added experimental external Blender MCP adapter tools: `blender.external_adapter_health`, `blender.external_render_preview`, and `blender.external_export_asset`.
- Added `CREATIVE_MCP_ENABLE_EXTERNAL_BLENDER_MCP`, `CREATIVE_MCP_EXTERNAL_BLENDER_MCP_URL`, and bounded operation allowlist configuration for trusted local Blender MCP servers.
- Added simulator coverage for external Blender MCP health, preview, and export calls without exposing raw external tool proxying.
- Added `docs/EXTERNAL_BLENDER_MCP_ADAPTER.md` with the opt-in configuration, safety policy, and JSON-RPC adapter contract.

### Changed

- Updated the external MCP adapter policy to describe the initial experimental implementation while keeping `dcc-mcp-blender` optional and disabled by default.
- Expanded the public tool schema snapshot from 57 to 60 tools.

## 0.2.20-alpha.0

### Changed

- Documented `npm install creative-pipeline-mcp@alpha` as the supported pre-v1 package install path.
- Added npm dist-tag maintenance guidance for keeping `latest` reserved for the intentional v1 stable release.
- Added troubleshooting notes for cases where unqualified `npm install creative-pipeline-mcp` resolves to an older alpha package.

### Verified

- Local release readiness, schema, and v1 freeze checks passed after the documentation update.

## 0.2.19-alpha.0

### Added

- Added bounded Premiere typed edit tools: `premiere.trim_clip`, `premiere.split_clip`, `premiere.move_clip`, `premiere.add_marker`, and `premiere.set_clip_speed`.
- Added CEP queue safety metadata for queued commands: `commandId`, `idempotencyKey`, `expectedSideEffects`, `requiresApproval`, `statusJsonPath`, and `rollbackHint`.
- Added CEP host dispatch handlers for typed trim, split, move, marker, and speed commands without exposing raw ExtendScript.
- Added simulator coverage for typed edit commands, including marker, trim, move, and speed state capture.

### Changed

- Updated Premiere CEP command status docs, API tool docs, v1 scope docs, and Premiere E2E docs for typed edit command handling.
- Updated the CEP panel pending-command priority so typed edits run after timeline creation and before marker/brand/export commands.
- Expanded the public tool schema snapshot from 52 to 57 tools.

### Verified

- Local tests passed with 43 tests.
- Local release gates passed for schema checks, v1 freeze checks, release readiness, unsigned CEP package verification, npm pack dry-run, and npm install smoke testing.

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
