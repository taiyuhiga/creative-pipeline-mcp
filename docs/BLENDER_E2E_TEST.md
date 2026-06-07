# Blender E2E Test

This guide records the alpha Blender verification flow for real and fallback environments.

## Environment Record

Fill this section for each manual run:

```text
OS:
Node:
Blender:
FFmpeg:
Command:
Result:
Artifacts:
Notes:
```

## Local Gates

Run from the repository root:

```bash
npm run build
node examples/blender-e2e.mjs
node examples/blender-bridge-queue.mjs
npm run blender:bridge-worker -- --once --dry-run
```

## Expected Artifacts

The exact filenames depend on the input asset, but successful runs should produce a subset of:

```text
artifacts/blender/
  *_preview.png
  *_asset_qc_report.json
  *_optimized.glb
  *_repair_report.json
```

## Acceptance Criteria For v0.3

- `blender.validate_asset` writes a QC report.
- `blender.render_preview` uses Blender when installed and a safe fallback otherwise.
- `blender.optimize_asset` reports before/after size metrics.
- `blender.repair_basic_asset` writes a repair report when Blender is installed.
- bridge queue commands can be drained by `scripts/blender-bridge-worker.mjs`.

