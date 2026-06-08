# Creative Pipeline MCP

[![CI](https://github.com/taiyuhiga/creative-pipeline-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/taiyuhiga/creative-pipeline-mcp/actions/workflows/ci.yml)

Creative Pipeline MCP is not just a Blender or Premiere controller. It is a QC-first orchestration layer for creative workflows:

- Blender/glTF asset QC and optimization
- Premiere media QC and CEP queue workflow
- approval-gated elevated operations
- artifacts, reports, and dashboard review

This repository implements a split creative pipeline architecture:

- `creative-mcp-core`: tool registry, router, approval policy, artifact store, QC reports, license manifest
- `blender-pro-mcp`: Blender/glTF asset inspection, preview artifacts, validation, optimization/export fallbacks
- `premiere-pro-mcp`: media ingest, ffprobe indexing, delivery QC, rough-cut OTIO plans, captions, audio/export plans
- `blender-gpl-adapters`: optional GPL adapter manifests kept separate from the core packages
- `premiere-windows-adapter`: Windows CEP/WebSocket reference guardrails
- `premiere-cep-panel`: minimal CEP panel scaffold for consuming Premiere IPC commands
- `director-agent`: production planning, Blender to Premiere handoff, full production reports, multi-agent review
- `dashboard`: local artifact/QC report viewer

## Status

Current version: `0.2.19-alpha.0`

This is an alpha. The QC-first path runs without Blender or Premiere installed:

- GLB/glTF metadata inspection and asset QC
- Media metadata QC through `ffprobe` when FFmpeg is installed
- Artifact writing, logs, license manifest, and approval policy
- server-side JSON Schema validation
- workspace input allowlists for local file reads
- pending approval artifacts for elevated tools
- real CLI adapters when optional tools are installed: headless Blender preview, bundled `gltf-transform`, optional `gltfpack`, FFmpeg black/silence/loudness checks, thumbnail extraction, FFmpeg `libvmaf` scoring
- Blender bridge queue/status IPC and a headless worker for trusted external scene and asset adapters
- Blender asset QC for triangle budget, origin, scale, normals, primary UVs, material count, and texture slots
- Blender optimization size comparison metrics and safe generated Blender script artifacts for game asset jobs
- template-based basic Blender repair for GLB/glTF assets when Blender is installed
- optional WhisperX, PySceneDetect, pyloudnorm, and VMAF adapter tools
- Dashboard approval queue UI, artifact previews, and job history
- Premiere CEP bridge for OTIO media import, duplicate import avoidance, sequence creation attempts, timeline-positioned clip insertion attempts, typed edit command queueing, export command queueing, brand package command queueing, and standardized status JSON
- bounded Premiere typed edit commands: `trim_clip`, `split_clip`, `move_clip`, `add_marker`, and `set_clip_speed`
- Premiere project-specific delivery builder for timeline, brand package, export plan, and CEP queue generation
- Premiere CEP host simulator for queue/status validation without a live Premiere runtime
- Premiere CEP unsigned package generation, optional ZXP signing hook, and signed ZXP release asset support
- approval-to-rerun flow in the dashboard for approved elevated tool requests
- Premiere CEP status reader
- Blender and generated-MP4 Premiere e2e examples
- v2.0+ manifests for USD, MaterialX, engine profiles, brand packages, social variants, subtitles, thumbnails, and Director Agent handoff
- typed delivery profiles and quality presets for QC-checkable "highest quality" requests
- MCP-style stdio JSON-RPC methods: `initialize`, `tools/list`, `tools/call`, `ping`
- CI runs unit tests on Node.js 20, 22, and 24, with separate package, adapter, Blender e2e, and Premiere QC e2e jobs
- guarded npm trusted-publishing workflow for release tags when npmjs.com trusted publisher settings are configured

Premiere timeline mutation and export/brand-package requests are queued through a trusted CEP file-based IPC adapter, with a minimal CEP panel scaffold included. The CEP edit surface is typed and bounded; raw ExtendScript is not exposed. WhisperX, PySceneDetect, pyloudnorm, VMAF, and GPL tools remain optional external adapters.

## Capability Status

| Feature | Status |
| --- | --- |
| GLB/glTF metadata QC | Working |
| Headless Blender preview | Working when Blender is installed |
| Blender bridge queue/status | Alpha worker process |
| glTF optimization | Working with `gltf-transform`; optional `gltfpack` |
| Basic Blender repair | Working when Blender is installed |
| Premiere media QC | Working when FFmpeg is installed |
| Premiere VMAF scoring | Working when FFmpeg includes `libvmaf` |
| Adapter availability report | Working with text and JSON output |
| Dashboard approvals/previews | Localhost-only, token-protected alpha |
| Premiere timeline creation | Project delivery builder + CEP scaffold |
| Premiere final export | Project export plan + CEP queue command |
| Full professional editing | Not v1 complete |

## Install

```bash
npm install
npm run build
npm test
npm run check:adapters
npm run check:adapters -- --json
```

## Quickstarts

### Blender QC

```bash
npm run build
node examples/blender-e2e.mjs
```

Expected outputs include preview, QC, optimized asset, and repair artifacts under `artifacts/blender/` when the relevant optional adapters are available.

### Blender Bridge Queue

```bash
npm run build
node examples/blender-bridge-queue.mjs
npm run blender:bridge-worker -- --once --dry-run
```

### Premiere QC And CEP Simulator

```bash
npm run build
node examples/premiere-qc-e2e.mjs
node examples/premiere-project-delivery.mjs
npm run simulate:premiere-cep -- --queue artifacts/examples/premiere-project-delivery/cep_queue --status artifacts/examples/premiere-project-delivery/cep_status
```

### Dashboard Approvals

```bash
CREATIVE_MCP_DASHBOARD_TOKEN=change-me npm run start:dashboard
open "http://127.0.0.1:4173/?token=change-me"
```

Typical artifacts:

```text
artifacts/
  adapter_check_report.json
  blender/
    cube_preview.png
    cube_asset_qc_report.json
    cube_optimized.glb
  premiere/
    source_rough_cut.otio
    source_delivery_qc_report.json
    source_thumbnail_1.png
    cep_queue/
```

## Run MCP Servers

```bash
npm run start:core
npm run start:blender
npm run start:premiere
```

Dashboard server:

```bash
CREATIVE_MCP_DASHBOARD_TOKEN=change-me npm run start:dashboard
open "http://127.0.0.1:4173/?token=change-me"
```

Premiere CEP panel scaffold:

```bash
npm run install:premiere-cep
npm run package:premiere-cep -- --verify
npm run install:premiere-cep -- --package dist/premiere-cep/creative-pipeline-mcp-premiere-cep-panel-0.2.19-alpha.0.zip
```

Release assets:

```bash
npm run release:assets
```

npm publishing:

```bash
npm publish --dry-run --provenance
```

For GitHub Actions publishing, configure npm trusted publishing for `.github/workflows/npm-publish.yml`, then set `NPM_TRUSTED_PUBLISHING_ENABLED=true` in repository variables.

Detailed docs:

- `docs/INSTALL_DASHBOARD.md`
- `docs/BLENDER_E2E_TEST.md`
- `docs/PREMIERE_E2E_TEST.md`
- `docs/API_TOOLS.md`
- `docs/API_STABILITY.md`
- `docs/V1_SCOPE.md`
- `docs/DELIVERY_PROFILES.md`
- `docs/QUALITY_PRESETS.md`
- `docs/COMPATIBILITY_MATRIX.md`
- `docs/CEP_STATUS_SCHEMA.md`
- `docs/ARTIFACT_SCHEMA.md`
- `docs/EXTERNAL_MCP_ADAPTERS.md`
- `docs/PREMIERE_MCP_REFERENCES.md`
- `docs/RELEASE_PROCESS.md`
- `docs/SECURITY_CHECKLIST.md`
- `docs/TROUBLESHOOTING.md`

Example `tools/list` request:

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
```

Example Blender QC call:

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"blender.validate_asset","arguments":{"path":"examples/minimal.glb","maxTriangles":50000}}}
```

Example Premiere QC call:

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"premiere.run_delivery_qc","arguments":{"path":"source.mp4","targetWidth":1080,"targetHeight":1920,"maxDuration":60}}}
```

Artifacts are written to `artifacts/` unless `CREATIVE_MCP_ARTIFACTS` is set.
Input files must be under `CREATIVE_MCP_WORKSPACE_ROOTS`; by default that is the current working directory.

## Safety

Default permission is `safe_write`. Tools marked `project_write`, `destructive`, or `admin` write a pending approval artifact unless a higher permission level is configured:

```bash
CREATIVE_MCP_PERMISSION=project_write npm run start:premiere
```

Use copies for production projects. Direct destructive operations, raw `bpy`, raw ExtendScript, deletion, publishing, external upload, cloud sync, and GPL adapter activation are not enabled by default.

## Licensing And Trademarks

This is an unofficial tool. It is not affiliated with or endorsed by Blender, Adobe, Premiere Pro, or 3D-Agent. Blender, Adobe, and Premiere Pro trademarks belong to their owners.

3D-Agent is not included. GPL tools are separated into optional external adapters so the Apache-2.0 core packages do not directly import GPL code.
