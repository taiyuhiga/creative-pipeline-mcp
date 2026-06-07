# Delivery Profiles

Delivery profiles turn vague requests such as "highest quality" into concrete export settings, QC thresholds, artifact names, and expected outputs.

The source catalog lives in `packages/core/src/profiles/deliveryProfiles.ts`.

## Premiere Profiles

| Profile | Purpose | Required Evidence |
| --- | --- | --- |
| `youtube_4k_high_quality` | 4K 16:9 YouTube master | export plan, final video, delivery QC report |
| `shorts_1080x1920_high_quality` | vertical Shorts/Reels/TikTok delivery | export plan, final video, caption QC, delivery QC |
| `podcast_video_clean_audio` | podcast video with strict loudness | export plan, final video, loudness report, delivery QC |
| `captioned_social_delivery` | caption-first social delivery | captions, caption QC, final video, delivery QC |

## Blender Profiles

| Profile | Purpose | Required Evidence |
| --- | --- | --- |
| `game_ready_glb` | optimized engine-ready GLB | source GLB, optimized GLB, preview PNG, asset QC report |
| `marketplace_asset` | marketplace package handoff | manifest, optimized GLB, preview PNG, asset QC report, license manifest |
| `cycles_high_quality_preview` | review-quality Cycles preview | preview PNG, asset QC report |
| `cycles_final_exr` | final EXR render handoff | final EXR, preview PNG, asset QC report |

## Policy

- Profiles are specifications, not raw execution bypasses.
- Public tools should map a profile into typed operations and artifacts.
- After external or live-adapter output, rerun local QC before claiming success.
- Experimental profiles must stay marked as experimental until they have real E2E evidence.

## Examples

Example profile files are available under `examples/profiles/`.
