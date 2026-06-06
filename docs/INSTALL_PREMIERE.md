# Premiere Install Notes

The alpha QC path can inspect media with `ffprobe` and FFmpeg without Premiere installed.

For timeline mutation and exports, install Premiere Pro and use a trusted CEP/ExtendScript bridge. `premiere.build_timeline_from_otio` queues a file-based IPC command under `CREATIVE_MCP_PREMIERE_IPC_DIR` for a CEP panel to consume. Raw ExtendScript execution should remain approval-gated. The Windows adapter package contains guardrails inspired by Windows CEP/WebSocket bridges, but it is not an installer.

Recommended external tools:

- FFmpeg / ffprobe
- MediaInfo
- OpenTimelineIO
- WhisperX, faster-whisper, or whisper.cpp
- PySceneDetect
- Auto-Editor
- pyloudnorm
- VMAF
