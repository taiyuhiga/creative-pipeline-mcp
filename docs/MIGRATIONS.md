# Migration Notes

This file tracks public schema and artifact-layout changes that users may need to react to.

## 1.1.6-alpha.0

Changed:
- Added `ae.run_approved_render` for experimental env-gated `aerender`/`nexrender` execution.
- Added `after-effects/render_run_report.json`.
- Public tool schema snapshot now covers 132 tools.

Migration:
- No action is required for existing callers.
- To execute real After Effects renders, set `CREATIVE_MCP_ENABLE_AE_APPROVED_RUNNER=true`, provide readable project/job inputs, keep output paths inside artifact/workspace roots, and retain project-write approval.

Compatibility:
- Existing After Effects render plan, queue, evidence, and motion QC artifacts remain compatible.
- Live execution claims remain guarded by readable output evidence and are still outside the stable v1 surface.

## 1.1.5-alpha.0

Changed:
- Hosted Windows CI jobs now target `windows-2025-vs2026` explicitly.
- Windows E2E documentation and compatibility evidence now reference the updated runner image and CI run.

Migration:
- No user action is required.

Compatibility:
- Public tool schemas are unchanged from `1.1.4-alpha.0`.
- Existing CEP command, status, and artifact files remain compatible.

## 1.1.4-alpha.0

Changed:
- CEP status schema documentation now lists every currently supported Premiere CEP command type.
- The v1 freeze checker now derives command types from the implementation instead of a stale hardcoded subset.

Migration:
- No user action is required. Queue/status JSON compatibility is unchanged.

Compatibility:
- Public tool schemas are unchanged from `1.1.3-alpha.0`.
- Existing CEP command and status files remain compatible.

## 1.1.3-alpha.0

Changed:
- Premiere CEP fallback installs now write or preserve `premiere-cep.json` with queue/status paths.
- Premiere CEP panel queue ordering now includes the expanded typed edit command surface.

Migration:
- Reinstall the CEP package after upgrading so Premiere loads the updated `js/main.js`, `jsx/host.jsx`, and `premiere-cep.json`.
- Remove older duplicate CEP extension folders if Premiere shows an old `Creative Pipeline MCP` panel.

Compatibility:
- Public tool schemas are unchanged from `1.1.2-alpha.0`.
- Existing queue/status JSON files remain compatible.

## 1.1.2-alpha.0

Changed:
- Added 14 experimental Premiere typed CEP queue tools for sequence creation, media import, clip insert/overwrite/replace/delete, transitions, video/audio presets, captions, preview render, and preset export.
- Public tool schema snapshot now covers 131 tools.

Migration:
- Use the new `premiere.*` typed edit tools only through the CEP queue/status bridge; do not replace them with raw ExtendScript or external Premiere MCP proxy calls.
- Treat these live timeline mutation tools as experimental until additional macOS and Windows Premiere evidence is collected.

Compatibility:
- Existing Premiere media QC, delivery QC, status, and five original typed edit tools remain additive-compatible.
- Stable v1 structured result, approval artifact, and CEP status schema expectations are unchanged.

## 1.1.0-alpha.0

Changed:
- Added experimental provider execution-planning tools for CapCut adapter resolution, CapCut draft package export, CapCut delivery QC, After Effects template replacement planning, After Effects file bridge planning, Roblox Studio operation planning, Roblox playtest reports, Roblox WEPPY provider planning, asset license policy evaluation, and asset package SBOM output.
- Added Dashboard provider tab metadata and MCP Registry distribution metadata.
- Public tool schema snapshot now covers 117 tools.

Migration:
- Continue to treat CapCut, After Effects, Roblox, WEPPY, and live app execution as experimental provider surfaces.
- Use `asset.evaluate_license_policy` and `asset.write_asset_sbom` before packaging acquired or generated asset bundles for downstream delivery.
- Use `creative-pipeline-mcp@alpha` in MCP client configs when the newest post-v1 experimental provider tools are required.

Compatibility:
- Stable v1 structured tool result shape is unchanged.
- Provider execution-planning schemas are additive alpha surfaces and may still change before being promoted to stable.
- `server.json` and `package.json` `mcpName` must remain synchronized for MCP Registry ownership verification.

## 1.0.0

Changed:
- Stable scope is limited to QC-first surfaces: core routing, provider planning, asset sourcing/provenance, Blender QC/artifact planning, Premiere media/delivery QC, Dashboard review, schema snapshots, artifact layouts, CI gates, and npm packaging.
- Live app execution providers remain experimental.
- npm `latest` is intentionally stable v1; alpha builds continue on the `alpha` dist-tag.

Migration:
- For production integrations, depend on stable core, Blender QC, Premiere QC, asset sourcing, provider planning, artifact, approval, Dashboard, and schema surfaces.
- Keep CapCut, After Effects, Roblox, external Blender MCP, optional adapter, and live Premiere CEP execution usage behind experimental controls.
- When installing the stable release, use `npm install creative-pipeline-mcp`; when installing post-v1 alpha provider tools, use `npm install creative-pipeline-mcp@alpha`.

Compatibility:
- v1 keeps public `structuredContent`, approval artifact, artifact layout, QC report, provider report, and CEP status schema expectations stable.
- Windows + Premiere live E2E remains outside the stable v1 claim until an interactive Windows Premiere host supplies status evidence.

## 0.3.3-alpha.0

Changed:
- Added provider-aware `video.create_edit` package generation with Premiere-first selection and CapCut fallback draft artifacts.

Migration:
- Callers that previously expected only Premiere rough-cut artifacts can inspect `data.plan.selectedProvider` and `data.fallbackDraft` to handle CapCut fallback output.
- Use the generated CapCut fallback artifacts as copy-on-write draft plans, not as raw draft mutation instructions.

Compatibility:
- This is an additive alpha surface.
- Live Premiere execution and CapCut execution are not implied by the artifact package.

## 0.3.0-alpha.0

Changed:
- Added Provider Registry tools for availability checks, video editor resolution, motion engine resolution, game engine resolution, and provider report writing.
- Added experimental CapCut, After Effects, and Roblox provider packages.

Migration:
- Use Provider Registry tools to choose the intended provider before invoking provider-specific planning tools.
- Keep provider-specific app execution behind the documented experimental/provider guardrails.

Compatibility:
- Provider reports are artifact-first planning outputs.
- Raw external app proxying remains unsupported.

## 0.2.16-alpha.0

- Public tool input schemas are snapshot-gated by `docs/API_TOOL_SCHEMAS.snapshot.json`.
- Top-level unknown tool input properties are rejected by the router.
- CEP status records use `creative.pipeline.premiere.status.v1` and normalize legacy status files through the status reader.
- Dashboard artifact and job APIs are token-protected and local-only.

## Future Change Template

```text
## <version>

Changed:
- 

Migration:
- 

Compatibility:
- 
```
