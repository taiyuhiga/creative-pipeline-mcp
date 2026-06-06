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
| macOS + Premiere | Manual required | see `docs/PREMIERE_E2E_TEST.md` |
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
