# External MCP Adapters

Creative Pipeline MCP should remain the QC, approval, artifact, and orchestration layer. External Blender or DCC MCPs may be useful as trusted scene-control adapters, but they should not replace the core safety model.

## Adapter Evaluation Checklist

- License compatibility with the Apache-2.0 core package.
- Whether raw script execution is required.
- Whether command inputs can be constrained by schema.
- Whether outputs can be captured as artifacts.
- Whether failures can be normalized into structured MCP errors.
- Whether workspace path restrictions can be preserved.
- Whether adapter activation can remain opt-in.

## Candidate: dcc-mcp-blender

Status: research required.

Evaluation goal: determine whether it can act as an external Blender operation adapter while Creative Pipeline MCP keeps QC reports, approval artifacts, and release artifacts.

## Candidate: ahujasid/blender-mcp

Status: research required.

Evaluation goal: determine whether it can safely support interactive Blender scene operations without weakening local workspace and raw-script guardrails.

## Integration Principle

External adapters should be treated like optional tools:

```text
tool request
  -> schema validation
  -> approval policy
  -> external adapter
  -> artifact capture
  -> QC/report normalization
```

