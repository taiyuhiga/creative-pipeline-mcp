# Compatibility Matrix

This matrix tracks v1 stable evidence and deferred live-execution evidence.

| Area | Status | Evidence |
| --- | --- | --- |
| Node 20 | CI covered | `unit-test (20)` |
| Node 22 | CI covered | `unit-test (22)` |
| Node 24 | CI covered | `unit-test (24)` |
| npm pack | CI covered | `package-test` |
| FFmpeg installed | CI covered | `premiere-qc-e2e` installs FFmpeg |
| FFmpeg missing | Partial | adapter check reports missing tools without failing |
| FFmpeg libvmaf installed | Local covered | `node scripts/check-adapters.mjs --json` reports `ffmpeg-libvmaf.available=true` |
| FFmpeg without libvmaf | Local simulated | fake `ffmpeg -filters` without `libvmaf` reports `ffmpeg-libvmaf.available=false` |
| Blender installed | Local/optional CI | `blender-e2e-optional` runs when available; `windows-blender-e2e` installs Blender on Windows |
| Blender missing | Partial | renderer/optimizer fallbacks are tested through unit paths |
| macOS + Blender | Local covered | `node examples/blender-e2e.mjs` rendered preview, optimized GLB, and wrote QC report |
| macOS + Premiere | Local covered | Premiere Pro 2026 CEP E2E on macOS 15/Darwin 24.6.0; timeline, brand, and export status success |
| Windows + Blender | CI covered/manual optional | `windows-blender-e2e` passed on GitHub Actions run `27082352428`; manual workstation evidence is still useful |
| Windows + Premiere | Deferred from stable v1 | `.github/workflows/windows-premiere-e2e.yml` can run on an interactive self-hosted Windows runner with Premiere installed |
| WhisperX installed | Local covered | `/Users/higataiyu/.local/bin/whisperx`; adapter check reports available |
| PySceneDetect installed | Local covered | `/Users/higataiyu/.local/bin/scenedetect`; adapter check reports available |
| pyloudnorm installed | Local covered | `python3 -m pip install --user pyloudnorm soundfile`; adapter check reports available |

## Known External Blocker

Windows + Premiere live E2E requires an interactive self-hosted Windows runner with Premiere installed. Hosted GitHub runners cannot launch Premiere or CEP panels. No such runner is currently registered for this repository, so Windows + Premiere live editing/export is explicitly deferred from the stable v1 claim. Issues `#20` and `#86` remain open for that future live evidence.

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

## Manual Result: macOS + Blender

```text
OS: macOS 15 / Darwin 24.6.0 arm64
Node: v20.19.1
Blender: /opt/homebrew/bin/blender
Command: node examples/blender-e2e.mjs
Result: pass
Artifacts: artifacts/examples/blender-e2e/cube.glb, artifacts/blender/cube_preview.png, artifacts/blender/cube_optimized.glb, artifacts/blender/cube_asset_qc_report.json
Notes: headless Blender preview rendered; glTF optimizer wrote optimized artifact; validate_asset wrote QC report with warning-only material findings.
```

## Hosted Result: Windows + Blender

```text
OS: GitHub Actions windows-latest
Node: 24
Blender: Chocolatey-installed Blender resolved through BLENDER_BIN
Command: node examples/blender-e2e.mjs
Result: pass
Artifacts: artifacts/examples/blender-e2e/cube.glb, artifacts/blender/cube_preview.png, artifacts/blender/cube_optimized.glb, artifacts/blender/cube_asset_qc_report.json
Notes: CI run 27082352428 job windows-blender-e2e installed Blender, verified CLI, and completed GLB preview/optimize/validate flow.
```

## Manual Result: Local Adapter Check

```text
OS: macOS 15 / Darwin 24.6.0 arm64
Command: node scripts/check-adapters.mjs --json
Result: 7/9 available
Available: ffprobe, ffmpeg, ffmpeg-libvmaf, blender, whisperx, scenedetect, pyloudnorm+soundfile
Missing: gltf-transform global CLI, gltfpack
Notes: package-local gltf-transform is still available through node_modules for optimize_asset; fake ffmpeg PATH check confirmed the no-libvmaf branch reports unavailable.
```
