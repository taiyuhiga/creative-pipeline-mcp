# Roadmap

## Completed In This Alpha

- Phase 0 design and licensing posture
- Phase 1 core registry/router/artifact/QC/approval infrastructure
- Phase 2 QC-first MVP
- Phase 3 Blender Pro MCP MVP surface with QC/export fallbacks
- Phase 4 Premiere Pro MCP MVP surface with ingest/index/rough-cut/caption/audio/export/QC plans
- Phase 5 macro tool surface
- Phase 6 optional GPL adapter package boundary
- Phase 9 safety policy
- Phase 10 dashboard
- Phase 11 public repository files
- Phase 15 v2.0+ manifests for USD/MaterialX/engine profiles, brand packages, social variants, multilingual subtitles, thumbnails, podcast repurposing, Director Agent handoff, production report, and multi-agent review
- server-side JSON Schema validation
- artifact path traversal hardening
- workspace input allowlist
- symlink realpath escape rejection by default
- pending approval artifact queue
- Dashboard localhost bind and token-protected API
- adapter availability JSON report
- Asset Sourcing Layer for source priority planning, candidate scoring, provenance, license manifests, and fal fallback generation guardrails
- Provider Registry for video editor, motion engine, and game engine availability/resolution/reporting
- experimental CapCut social draft plan/manifest/QC provider
- experimental After Effects render plan/queue-manifest/env-gated approved-runner/motion-QC provider
- experimental Roblox read-only inspection/Luau-QC/command-manifest provider
- headless Blender, glTF optimizer, FFmpeg QC, thumbnail, and Premiere CEP queue adapters
- Blender bridge queue/status adapter surface
- Blender bridge worker process for queue draining, status writing, processed-command archival, and headless Blender script execution
- Blender QC coverage for normals, primary UVs, material count, and texture slots
- Blender optimization size metrics and safe generated Blender script artifacts
- template-based Blender basic repair for scale, normals, triangulation, and GLB export
- Blender GLB e2e sample
- optional WhisperX, PySceneDetect, and pyloudnorm adapter tools
- optional FFmpeg libvmaf adapter tool
- Dashboard approval queue UI, artifact previews, and job history
- Dashboard adapter availability, QC detail, CEP status, Blender/Premiere galleries, failed-job retry, rerun history, and download controls
- Dashboard provider status visibility for Provider Registry, CapCut, After Effects, and Roblox artifacts
- Dashboard failed-job retry for provider, CapCut, After Effects, and Roblox tools
- Provider workflow simulator for Provider Registry, CapCut, After Effects, Roblox, and Director artifact coverage
- Provider-aware `video.create_edit` package generation with Premiere-first selection and CapCut fallback draft artifacts
- After Effects render evidence collection for status/output proof without live execution overclaiming
- After Effects approved-runner render execution with env-gated command execution and evidence-based live claims
- Roblox Studio evidence collection for read-only status/place proof without live Studio overclaiming
- Roblox official Studio MCP stdio session plan and client config artifacts without raw Studio proxying
- Premiere CEP panel MVP for OTIO media import, duplicate import avoidance, sequence creation attempts, timeline-positioned clip insertion attempts, export command handling, brand package command handling, and standardized status JSON
- Dashboard approval-to-rerun flow for approved elevated tool requests
- Premiere CEP status reader
- Premiere CEP status polling and export delivery QC finalization
- generated-MP4 Premiere QC/CEP queue e2e sample
- Premiere project-specific delivery builder for template, OTIO timeline, brand package, export plan, and CEP command queue generation
- Premiere CEP host simulator for queue draining, host.jsx dispatch, status writing, processed-command archival, and project-delivery preflight validation
- split CI jobs for Node.js 20/22/24 unit tests, package dry-run, adapter check, optional Blender e2e, and Premiere QC e2e
- dashboard and Premiere real-project e2e docs
- release asset generation script and npm publish readiness docs
- release-readiness gate, npm install smoke test, migration notes, changelog, and example project manifests
- npm trusted-publishing workflow with OIDC, release tag/package version guard, and publish gates
- CEP status, artifact schema, and troubleshooting docs
- strict public top-level tool schemas with enum and length guards
- API tool list and compatibility matrix docs
- Premiere CEP development install/uninstall script
- Premiere CEP unsigned package generation, manifest validation, checksum output, ZIP verification, and optional ZXP signing hook
- Premiere CEP zip/ZXP install fallback for local CEP extension target installation
- Premiere CEP queue watcher UI for selected/all pending commands

## Known Blockers

- Windows + Premiere live E2E requires an interactive self-hosted Windows runner with Premiere installed. Hosted GitHub runners cannot launch Premiere or CEP panels.
- Windows + Premiere live editing/export remains deferred from the stable v1 claim until live evidence exists.

## Next Release

- `1.0.0` is the stable QC-first package release for verified core, provider planning, asset sourcing, Blender QC, Premiere QC, dashboard, schemas, artifacts, and package distribution.
- The next alpha should deepen actual After Effects runner integration evidence, CapCut draft execution evidence, or Roblox Studio live status evidence while keeping CapCut, After Effects, Roblox, and external app execution claims experimental until live evidence exists.
- Keep future npm pre-releases on the `alpha` dist-tag while package versions include pre-release suffixes.
- Keep future alpha and beta GitHub releases marked as pre-releases. Keep stable releases on semver tags without pre-release suffixes.
- Do not close Windows + Premiere verification issues until the self-hosted workflow produces live CEP status artifacts.

## v1 Scope

Current v1-ready scope:

- macOS + Blender local E2E
- macOS + Premiere CEP E2E
- Windows + Blender hosted CI E2E
- Node.js 20/22/24 package and schema gates
- strict public tool schema snapshot
- v1 freeze validation for tools, inputs, `structuredContent`, QC reports, artifact layout, and CEP status schema
- typed delivery profiles and quality presets for QC-checkable "highest quality" requests
- typed asset sourcing plans and provenance manifests for source-selection workflows
- provider availability and resolution reporting
- release assets and npm trusted-publishing workflow

Deferred or explicitly limited scope:

- Windows + Premiere live E2E until an interactive self-hosted runner is available
- production-signed Premiere CEP installer with a trusted commercial certificate
- direct proxying of external Blender or Premiere MCP servers
- stable CapCut, After Effects, or Roblox execution claims
- direct proxying of CapCut, After Effects, Roblox Studio, or external MCP servers

## External Adapter Work

- project certificate-backed signed Premiere CEP installer and live Premiere runtime validation
- CapCut execution adapter evidence after copy-on-write draft safety review
- After Effects render execution evidence for aerender/nexrender
- Roblox official Studio MCP integration evidence for future write tools
