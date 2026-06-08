# Artifact Schema

Artifacts are written under `CREATIVE_MCP_ARTIFACTS`, defaulting to `artifacts/`.

## Common Layout

```text
artifacts/
  adapter_check_report.json
  assets/
    sourcing_plan.json
    candidates.json
    selected_asset.json
    provenance.json
    license_manifest.json
    original/
    generated/
      fal_request.json
      fal_result.json
    optimized/
    qc/
  approvals/
    pending/
    resolved/
  blender/
  examples/
  logs/
  premiere/
    cep_queue/
    cep_status/
  dashboard/
    reruns/
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

## QC Report

QC reports use the core shape from `packages/core/src/qcReport.ts`:

```json
{
  "kind": "media",
  "target": "/workspace/source.mp4",
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "summary": {
    "status": "pass",
    "pass": 1,
    "warn": 0,
    "fail": 0
  },
  "checks": [
    {
      "id": "duration",
      "status": "pass",
      "message": "Duration within target"
    }
  ],
  "metadata": {}
}
```

The required keys are `kind`, `target`, `generatedAt`, `summary`, and `checks`. `metadata` is optional.

## Asset Sourcing

Asset sourcing artifacts use explicit provenance and are stored under `artifacts/assets/`.

```json
{
  "schema": "creative.pipeline.asset_sourcing_plan.v1",
  "prompt": "studio chair",
  "intent": "generic_furniture",
  "policy": "fallback_only",
  "priority": ["local_cache", "user_supplied", "polyhaven", "sketchfab", "fal_hunyuan"],
  "guardrails": {
    "fallbackOnlyDefault": true,
    "serverSideFalKeyOnly": true,
    "writeProvenance": true,
    "requireFinalQc": true,
    "noRawExternalProxy": true
  }
}
```

Every acquired or generated asset should include `assets/provenance.json` and `assets/license_manifest.json`. Final delivery must include a QC report from `blender.validate_asset` or equivalent evidence under `assets/qc/`.
