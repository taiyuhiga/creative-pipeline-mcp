# Compatibility Matrix

This matrix tracks what must be verified before v1.

| Area | Status | Evidence |
| --- | --- | --- |
| Node 20 | CI covered | `unit-test (20)` |
| Node 22 | CI covered | `unit-test (22)` |
| Node 24 | CI covered | `unit-test (24)` |
| npm pack | CI covered | `package-test` |
| FFmpeg installed | CI covered | `premiere-qc-e2e` installs FFmpeg |
| FFmpeg missing | Partial | adapter check reports missing tools without failing |
| FFmpeg libvmaf installed/missing | Adapter check | `ffmpeg-libvmaf` availability report |
| Blender installed | Local/optional CI | `blender-e2e-optional` runs when available |
| Blender missing | Partial | renderer/optimizer fallbacks are tested through unit paths |
| macOS + Blender | Local covered | local e2e evidence |
| macOS + Premiere | Local covered | Premiere Pro 2026 CEP E2E on macOS 15/Darwin 24.6.0; timeline, brand, and export status success |
| Windows + Blender | Manual required | no current hosted verification |
| Windows + Premiere | Manual required | no current hosted verification |
| WhisperX installed/missing | Adapter check | availability report |
| PySceneDetect installed/missing | Adapter check | availability report |
| pyloudnorm installed/missing | Adapter check | availability report |

Manual results should be recorded with:

```text
OS:
Node:
Blender:
Premiere:
FFmpeg:
Command:
Result:
Artifacts:
Notes:
```

## Manual Result: macOS + Premiere

```text
OS: macOS 15 / Darwin 24.6.0 arm64
Node: v20.19.1
Premiere: Adobe Premiere Pro 2026 / PPRO 26.2.2 CEP runtime
FFmpeg: 7.1.1
Command: generated valid H.264/AAC MP4, queued premiere.build_project_delivery commands, installed CEP panel, ran Run All Pending in Premiere
Result: pass
Artifacts: artifacts/examples/premiere-live-cep-2/cep_status/*.json
Notes: build_timeline_from_otio imported 1 media item and inserted 1 clip; apply_brand_package returned success; export_sequence queued Adobe Media Encoder and returned success.
```
