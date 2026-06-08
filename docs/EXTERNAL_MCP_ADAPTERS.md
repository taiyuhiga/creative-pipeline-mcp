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

Status: evaluated on 2026-06-07.

Repository: <https://github.com/dcc-mcp/dcc-mcp-blender>

Snapshot:

- License: MIT.
- Default branch: `main`.
- Latest release observed: `v0.1.11`.
- Transport: embedded Blender add-on exposing an MCP HTTP endpoint inside Blender.
- Tooling scope: broad DCC/Blender operations, including scene, object, mesh, UV, materials, render, validation, pipeline, and export tools.

Assessment:

- Good candidate for an opt-in external Blender operation adapter.
- Better architectural fit than direct script execution because it already models Blender operations as MCP tools.
- Keep it behind Creative Pipeline MCP schema validation and approval policy.
- Do not expose its full tool surface directly to production clients by default. Route only bounded operations such as import/export, object transforms, validation, preview capture, and publish-package actions.
- Capture every output through `ArtifactStore`, then rerun local QC with `blender.validate_asset`.

Decision: adopt as a preferred research/integration target for the external bridge path, but keep it optional and disabled by default.

v1 policy:

- Keep `dcc-mcp-blender` as an experimental optional adapter candidate.
- Do not expose its full tool surface directly to users.
- Do not add a raw external MCP proxy in v1.
- The initial experimental implementation is documented in `docs/EXTERNAL_BLENDER_MCP_ADAPTER.md`.
- It requires `CREATIVE_MCP_ENABLE_EXTERNAL_BLENDER_MCP=true`, a configured local URL, bounded operation names, approval checks for writes, artifact capture, and local QC after external outputs where supported.

## Candidate: ahujasid/blender-mcp

Status: evaluated on 2026-06-07.

Repository: <https://github.com/ahujasid/blender-mcp>

Snapshot:

- License: MIT.
- Default branch: `main`.
- Release metadata: no GitHub release observed.
- Transport: separate MCP server connecting to a Blender add-on over a socket.
- Tooling scope: interactive scene/object/material control, viewport screenshots, asset search/download integrations, and arbitrary Blender Python execution.
- Open security-relevant issues observed:
  - `#207 execute_blender_code enables unrestricted arbitrary code execution via LLM-controlled input`
  - `#257 [Vulnerability] blender-mcp Arbitrary File Write via polyhaven include_path Traversal`

Assessment:

- Useful reference implementation for interactive Blender control and community usage patterns.
- Not acceptable as a direct production adapter while arbitrary code execution and file-write traversal risks remain unresolved.
- If used, require a separate untrusted workspace, no shared secrets, constrained network access, and an allowlisted command wrapper.
- Never route raw `execute_blender_code` or equivalent tools from Creative Pipeline MCP without explicit project approval and a separate sandbox boundary.

Decision: reference-only for now. Do not integrate as the default external adapter.

v1 policy: keep this repository reference-only. Never proxy `execute_blender_code` or equivalent arbitrary Python execution through Creative Pipeline MCP.

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
