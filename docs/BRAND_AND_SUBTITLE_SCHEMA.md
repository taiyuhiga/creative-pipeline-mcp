# Brand and Subtitle Schemas

## Brand Package

`premiere.apply_brand_package` writes `creative.pipeline.brand_package.v1`.

Required fields:

- `source`: source media path.
- `colors`: `primary`, `secondary`, and `accent` color values.
- `typography`: font family and weight metadata.
- `captionStyle`: caption placement, line count, background, text color, and outline color.
- `lowerThirdStyle`: lower-third placement and logo behavior.
- `safeMargins`: title/action safe percentages and caption bottom clearance.
- `appliesTo`: target surfaces such as captions, lower thirds, thumbnail, and end card.

The tool also writes `creative.pipeline.brand_preview.v1` so dashboard or review clients can display the resolved colors, typography, caption mapping, and safe margins without parsing the full command payload.

## Timeline Markers

`premiere.apply_timeline_markers` writes a marker manifest and queues `apply_timeline_markers`.

Supported marker groups:

- `intro`: intro start/end seconds.
- `outro`: outro start/end seconds.
- `safe_margin`: title/action/caption safe-area metadata.
- custom `markers`: caller-supplied marker objects.

## Subtitles

`premiere.validate_subtitles` writes `creative.pipeline.subtitle_qc.v1` for SRT or VTT files.

QC fields:

- cue count
- invalid timings
- empty cues
- overlap count
- max characters per second
- max words per minute

`premiere.cleanup_subtitles` writes normalized SRT or VTT plus `creative.pipeline.subtitle_cleanup.v1`.

`premiere.describe_subtitle_artifacts` and `premiere.create_multilanguage_subtitles` use `creative.pipeline.multilingual_subtitles.v1`, listing per-language SRT, VTT, and subtitle QC artifacts.
