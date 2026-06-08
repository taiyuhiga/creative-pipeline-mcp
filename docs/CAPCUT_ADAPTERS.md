# CapCut Adapters

CapCut support is an experimental social-video provider for draft planning and QC. It is designed as a fallback when Premiere is unavailable or when a short-form workflow is better represented as a CapCut draft.

## Tools

- `capcut.check_availability`
- `capcut.create_draft_plan`
- `capcut.write_draft_manifest`
- `capcut.run_draft_qc`
- `capcut.create_social_draft`

## Optional Backends

The current implementation records availability and writes artifacts. Future execution adapters may wrap:

- CapCutAPI
- CapCut Mate
- `capcut-cli`
- `pyJianYingDraft`
- `cut_cli`

These remain optional and disabled by default until their behavior, licensing, and draft-write safety are reviewed.

## Artifact Layout

```text
artifacts/capcut/
  availability_report.json
  draft_plan.json
  draft_manifest.json
  draft_qc_report.json
```

Draft plans are copy-on-write. Source media is referenced, not modified.
