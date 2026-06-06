# Creative Pipeline MCP

QC-first MCP pipeline for Blender asset workflows and Adobe Premiere media workflows.

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

This is `0.1.1-alpha.0`. The QC-first path runs without Blender or Premiere installed:

- GLB/glTF metadata inspection and asset QC
- Media metadata QC through `ffprobe` when FFmpeg is installed
- Artifact writing, logs, license manifest, and approval policy
- server-side JSON Schema validation
- workspace input allowlists for local file reads
- pending approval artifacts for elevated tools
- real CLI adapters when optional tools are installed: headless Blender preview, bundled `gltf-transform`, optional `gltfpack`, FFmpeg black/silence/loudness checks, thumbnail extraction
- optional WhisperX, PySceneDetect, and pyloudnorm adapter tools
- Dashboard approval queue UI
- Premiere CEP bridge MVP for OTIO media import, sequence creation attempts, clip insertion attempts, and status JSON
- v2.0+ manifests for USD, MaterialX, engine profiles, brand packages, social variants, subtitles, thumbnails, and Director Agent handoff
- MCP-style stdio JSON-RPC methods: `initialize`, `tools/list`, `tools/call`, `ping`

Premiere timeline mutation is queued through a trusted CEP file-based IPC adapter, with a minimal CEP panel scaffold included. WhisperX, PySceneDetect, pyloudnorm, VMAF, and GPL tools remain optional external adapters.

## Install

```bash
npm install
npm run build
npm test
npm run check:adapters
```

Blender e2e sample:

```bash
npm run build
node examples/blender-e2e.mjs
```

## Run MCP Servers

```bash
npm run start:core
npm run start:blender
npm run start:premiere
```

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
