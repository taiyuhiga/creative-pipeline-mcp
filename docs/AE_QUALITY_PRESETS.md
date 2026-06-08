# After Effects Quality Presets

After Effects uses render profiles as experimental quality presets.

| Preset | Output | QC Focus |
| --- | --- | --- |
| `ae_motion_preview_1080p` | PNG preview frame or 1080p MOV | comp selection, frame output, render status |
| `ae_social_motion_9x16` | vertical MOV | safe area, duration, captions handoff |
| `ae_master_prores_motion` | ProRes MOV | archival render plan, output module, motion QC |

These presets are not yet part of the stable v1 freeze. They should become typed profile catalog entries only after render execution evidence exists.
