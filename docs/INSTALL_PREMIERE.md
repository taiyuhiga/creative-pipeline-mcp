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
- VMAF

MCP tools:

- `premiere.transcribe_media`: uses WhisperX when available, otherwise writes an adapter manifest
- `premiere.detect_scenes`: uses PySceneDetect when available, otherwise writes an adapter manifest
- `premiere.measure_loudness`: uses pyloudnorm when available, otherwise writes an adapter manifest
- `premiere.build_timeline_from_otio`: writes a CEP queue command for the panel scaffold
- `premiere.export_video`: writes an export plan and queues `export_sequence`
- `premiere.apply_brand_package`: writes a brand package manifest and queues `apply_brand_package`
- `premiere.read_cep_status`: reads status JSON written by the CEP panel scaffold

Generated sample:

```bash
npm run build
node examples/premiere-qc-e2e.mjs
```

For a real Premiere project walkthrough, see `docs/PREMIERE_E2E_TEST.md`.
