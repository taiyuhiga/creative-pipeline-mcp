# Premiere Install Notes

The alpha QC path can inspect media with `ffprobe` without Premiere installed.

For timeline mutation and exports, install Premiere Pro and use a trusted CEP/ExtendScript bridge. Raw ExtendScript execution should remain approval-gated. The Windows adapter package contains guardrails inspired by Windows CEP/WebSocket bridges, but it is not an installer.

Recommended external tools:

- FFmpeg / ffprobe
- MediaInfo
- OpenTimelineIO
- WhisperX, faster-whisper, or whisper.cpp
- PySceneDetect
- Auto-Editor
- pyloudnorm
- VMAF

