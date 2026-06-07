# Quality Presets

Quality presets define reusable QC bars for renders, media exports, and asset handoffs.

The source catalog lives in `packages/core/src/profiles/qualityProfiles.ts`.

## Presets

| Preset | Domain | Stability | Purpose |
| --- | --- | --- | --- |
| `master_prores_422_hq` | Premiere | Experimental | mezzanine-quality archival master |
| `youtube_4k_high_quality` | Premiere | Stable candidate | 4K H.264 delivery with loudness and VMAF checks |
| `shorts_1080x1920_high_quality` | Premiere | Stable candidate | vertical social export with caption safe-area checks |
| `game_ready_glb` | Blender | Stable candidate | optimized GLB with normals, UV, material, and triangle checks |
| `usd_vfx_handoff` | Blender | Experimental | USD/VFX package handoff |
| `cycles_final_exr` | Blender | Experimental | final Cycles EXR render handoff |

## Required Behavior

- A preset must include concrete settings, QC thresholds, and expected artifacts.
- A preset must be JSON-serializable.
- A preset must not imply raw script execution.
- A preset should be referenced by typed tools and release docs before being treated as stable.
