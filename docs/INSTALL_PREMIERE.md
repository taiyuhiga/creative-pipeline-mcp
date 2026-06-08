# Premiere Install Notes

The alpha QC path can inspect media with `ffprobe` and FFmpeg without Premiere installed.

For timeline mutation and exports, install Premiere Pro and use a trusted CEP/ExtendScript bridge. `premiere.build_timeline_from_otio` queues a file-based IPC command under `CREATIVE_MCP_PREMIERE_IPC_DIR` for a CEP panel to consume. A minimal panel scaffold is included in `packages/premiere-cep-panel`. Raw ExtendScript execution should remain approval-gated. The Windows adapter package contains guardrails inspired by Windows CEP/WebSocket bridges, but it is not an installer.

Recommended external tools:

- FFmpeg / ffprobe
- MediaInfo
- OpenTimelineIO
- WhisperX, faster-whisper, or whisper.cpp
- PySceneDetect
- Auto-Editor
- pyloudnorm
- FFmpeg with `libvmaf` for reference-based quality scoring

MCP tools:

- `premiere.transcribe_media`: uses WhisperX when available, otherwise writes an adapter manifest
- `premiere.detect_scenes`: uses PySceneDetect when available, otherwise writes an adapter manifest
- `premiere.measure_loudness`: uses pyloudnorm when available, otherwise writes an adapter manifest
- `premiere.measure_vmaf`: uses FFmpeg `libvmaf` when available, otherwise writes an adapter report
- `premiere.build_timeline_from_otio`: writes a CEP queue command for the panel scaffold
- `premiere.build_project_delivery`: writes a project-specific template, OTIO timeline, brand package, export plan, and queues CEP commands
- `premiere.export_video`: writes an export plan and queues `export_sequence`
- `premiere.apply_brand_package`: writes a brand package manifest and queues `apply_brand_package`
- `premiere.read_cep_status`: reads status JSON written by the CEP panel scaffold
- `premiere.await_cep_status`: polls for a matching CEP status by command id or command type
- `premiere.finalize_export_qc`: resolves an export status and runs delivery QC after the exported file exists

Generated sample:

```bash
npm run build
node examples/premiere-qc-e2e.mjs
node examples/premiere-project-delivery.mjs
npm run simulate:premiere-cep -- --queue artifacts/examples/premiere-project-delivery/cep_queue --status artifacts/examples/premiere-project-delivery/cep_status
```

For a real Premiere project walkthrough, see `docs/PREMIERE_E2E_TEST.md`.
For CEP status records, see `docs/CEP_STATUS_SCHEMA.md`.

CEP simulator:

```bash
npm run simulate:premiere-cep -- --queue artifacts/premiere/cep_queue --status artifacts/premiere/cep_status
```

The simulator loads `packages/premiere-cep-panel/jsx/host.jsx` into a Node VM with a fake Premiere app, dispatches queued commands through the same host functions, writes normalized status JSON, and archives processed command files. It is not a replacement for a real Premiere run, but it verifies host-side command parsing, OTIO clip collection, sequence creation, brand package status, export status, and queue/status file behavior before live testing.

## Unsigned CEP Package

```bash
npm run package:premiere-cep -- --verify
```

This writes an unsigned package and checksums under `dist/premiere-cep`. To produce a signed ZXP, install Adobe `ZXPSignCmd` and provide a project signing certificate:

## Signed ZXP Package

```bash
ZXPSIGNCMD_BIN=/path/to/ZXPSignCmd CEP_SIGN_CERT=/path/to/cert.p12 CEP_SIGN_PASSWORD=secret npm run package:premiere-cep -- --sign
```

Release builds may also include a signed ZXP asset:

```text
creative-pipeline-mcp-premiere-cep.zxp
zxp-checksums.txt
```

Keep `.p12` signing certificates under `certs/` or another ignored local path. These files include private keys and must not be committed or uploaded to GitHub release assets.

## Install Fallback

```bash
npm run install:premiere-cep -- --package dist/premiere-cep/creative-pipeline-mcp-premiere-cep-panel-0.2.25-alpha.0.zip
npm run install:premiere-cep -- --zxp dist/zxp/creative-pipeline-mcp-premiere-cep.zxp
```

The fallback installer extracts the package, validates `CSXS/manifest.xml`, `index.html`, `js/main.js`, `jsx/host.jsx`, and `package.json`, then copies the extension into the local Adobe CEP extensions folder. This is useful when Adobe Extension Manager or UPI command-line installation is unavailable.

CEP queue defaults:

```bash
cat > "$HOME/Library/Application Support/Adobe/CEP/extensions/creative.pipeline.mcp/premiere-cep.json" <<'JSON'
{
  "queueDir": "/absolute/path/to/artifacts/premiere/cep_queue"
}
JSON
```

When this file exists in the installed CEP extension folder, the panel preloads the queue directory on launch and refreshes pending commands. This avoids manual path entry in Premiere.
