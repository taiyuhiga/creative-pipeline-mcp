# CEP Status Schema

Premiere CEP status files use:

```json
{
  "schema": "creative.pipeline.premiere.status.v1",
  "commandId": "1780000000000-abc",
  "commandType": "build_timeline_from_otio",
  "status": "success",
  "message": "timeline build completed",
  "details": {
    "imported": 1,
    "media": 1,
    "inserted": 1,
    "sequenceName": "Creative Pipeline Rough Cut"
  },
  "finishedAt": "2026-01-01T00:00:00.000Z",
  "processedAt": "2026-01-01T00:00:01.000Z"
}
```

Supported `commandType` values:

- `build_timeline_from_otio`
- `export_sequence`
- `apply_brand_package`
- `apply_timeline_markers`
- `trim_clip`
- `split_clip`
- `move_clip`
- `add_marker`
- `set_clip_speed`

Supported `status` values:

- `success`
- `accepted`
- `error`

Queued CEP command JSON also carries safety metadata:

```json
{
  "commandId": "1780000000000-abc",
  "idempotencyKey": "project-a-trim-001",
  "expectedSideEffects": ["clip timing may change"],
  "requiresApproval": true,
  "statusJsonPath": "artifacts/premiere/cep_status/1780000000000-abc.json",
  "rollbackHint": "Undo in Premiere or restore the previous project save."
}
```

The MCP status reader normalizes legacy status files to this schema. `premiere.await_cep_status` can poll by `commandId` and/or `commandType`, and `premiere.finalize_export_qc` uses `export_sequence` status details to locate the exported file before writing delivery QC.

Sample fixtures:

- `docs/examples/cep_status_timeline_success.sample.json`
- `docs/examples/cep_status_brand_success.sample.json`
- `docs/examples/cep_status_export_success.sample.json`
