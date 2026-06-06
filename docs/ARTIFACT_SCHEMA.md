# Artifact Schema

Artifacts are written under `CREATIVE_MCP_ARTIFACTS`, defaulting to `artifacts/`.

## Common Layout

```text
artifacts/
  adapter_check_report.json
  approvals/
    pending/
    resolved/
  blender/
  examples/
  logs/
  premiere/
    cep_queue/
    cep_status/
```

## Approval Request

```json
{
  "action": "blender.export_game_ready",
  "risk": "project_write",
  "currentPermission": "safe_write",
  "requestedAt": "2026-01-01T00:00:00.000Z",
  "expiresAt": "2026-01-02T00:00:00.000Z",
  "approvalToken": "00000000-0000-4000-8000-000000000000",
  "artifactRoot": "/workspace/artifacts",
  "workspaceRoots": ["/workspace"],
  "expectedOutputs": {
    "artifacts": "tool-dependent",
    "sideEffects": "project_write"
  },
  "input": {}
}
```

## Adapter Check Report

See `docs/examples/adapter_check_report.sample.json`.
