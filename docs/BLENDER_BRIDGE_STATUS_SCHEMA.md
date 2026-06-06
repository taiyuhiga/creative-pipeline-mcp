# Blender Bridge Status Schema

Trusted Blender bridge adapters can write status files under `artifacts/blender/bridge_status` or `CREATIVE_MCP_BLENDER_STATUS_DIR`.

```json
{
  "schema": "creative.pipeline.blender.status.v1",
  "commandId": "1780000000000-abc",
  "commandType": "create_asset",
  "status": "success",
  "message": "asset created",
  "details": {
    "outputPath": "artifacts/blender/asset.glb",
    "previewPath": "artifacts/blender/asset_preview.png"
  },
  "finishedAt": "2026-01-01T00:00:00.000Z"
}
```

Supported `commandType` values:

- `create_scene`
- `create_asset`
- `modify_asset`
- `apply_material`
- `run_safe_script`

Supported `status` values:

- `success`
- `accepted`
- `error`

`blender.read_bridge_status` reads normalized status records. `blender.await_bridge_status` polls by `commandId` and/or `commandType`.

The bundled worker can consume queued commands and write this schema:

```bash
npm run blender:bridge-worker -- --once --dry-run
```

When not in dry-run mode, set `BLENDER_BIN` or make `blender` available on `PATH`. Processed command files are archived under `bridge_queue/processed` by default.
