# Premiere E2E Test

This guide verifies the alpha CEP bridge with a real Premiere project.

## Setup

1. Install the CEP panel from `packages/premiere-cep-panel`.
2. Enable CEP debug mode for your Adobe/Premiere version.
3. Open a new Premiere project.
4. Set the panel queue directory to:

```text
artifacts/premiere/cep_queue
```

## Run

Build the package and create a generated MP4 sample:

```bash
npm run build
node examples/premiere-qc-e2e.mjs
```

Then run the CEP panel poll action in Premiere.

Expected result:

- media is imported once
- an active or new sequence receives the clip
- the clip is inserted at the OTIO timeline position
- a status JSON file is written under `artifacts/premiere/cep_status`

Live macOS evidence from `v0.2.16-alpha.0`:

- `build_timeline_from_otio`: `success`, imported `1`, inserted `1`
- `apply_brand_package`: `success`
- `export_sequence`: `success`, queued in Adobe Media Encoder
- status artifacts: `artifacts/examples/premiere-live-cep-2/cep_status/*.json`

Read the status:

```bash
CREATIVE_MCP_PERMISSION=project_write npm run start:premiere
```

Call `premiere.read_cep_status` or `premiere.await_cep_status` from the MCP client.

## Export Queue

`premiere.export_video` writes an `export_sequence` command with:

```json
{
  "outputPath": "artifacts/premiere/exports/final.mp4",
  "presetPath": ""
}
```

The CEP host script attempts `app.encoder.encodeSequence`. If Adobe Media Encoder is unavailable, it records an accepted status instead of claiming a completed export.

After the CEP panel writes an `export_sequence` status, call `premiere.finalize_export_qc` with the `commandId`. The tool resolves `details.outputPath` from the status file, checks that the exported file exists, and writes an export delivery QC report. If the file is still missing, it writes a pending artifact instead of reporting a false pass.

## CEP Queue Config

The installed panel can preload a queue path from `premiere-cep.json` in the installed extension folder:

```json
{
  "queueDir": "/absolute/path/to/artifacts/premiere/cep_queue"
}
```

The panel sorts pending commands into timeline, brand, then export order before `Run All Pending` executes them sequentially.
