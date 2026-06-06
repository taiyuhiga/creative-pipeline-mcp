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

Read the status:

```bash
CREATIVE_MCP_PERMISSION=project_write npm run start:premiere
```

Call `premiere.read_cep_status` from the MCP client.

## Export Queue

`premiere.export_video` writes an `export_sequence` command with:

```json
{
  "outputPath": "artifacts/premiere/exports/final.mp4",
  "presetPath": ""
}
```

The CEP host script attempts `app.encoder.encodeSequence`. If Adobe Media Encoder is unavailable, it records an accepted status instead of claiming a completed export.
