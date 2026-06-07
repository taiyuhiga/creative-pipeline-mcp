# Premiere MCP References

Creative Pipeline MCP should not direct-proxy external Premiere MCP servers. Premiere project mutation has high blast radius, so the local policy remains typed CEP queue commands, status JSON, artifacts, and QC.

## Reference: leancoderkavy/premiere-pro-mcp

Repository: <https://github.com/leancoderkavy/premiere-pro-mcp>

Observed on 2026-06-07:

- Default branch: `main`
- Public reference for broad Premiere CEP/ExtendScript control
- Useful design reference for command coverage, QE DOM boundaries, and timeline operation naming

Policy:

- Do not proxy raw scripts or full external tool surfaces into Creative Pipeline MCP.
- Extract useful operation names only after converting them into typed CEP commands with schema validation, approval checks, artifact capture, and status fixtures.

## Reference: hetpatel-11/Adobe_Premiere_Pro_MCP

Repository: <https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP>

Observed on 2026-06-07:

- Default branch: `main`
- Public reference for Premiere tool validation and live-execution reporting
- Useful reference for separating schema-validated tools from live-executed tools

Policy:

- Treat validation reporting as a useful pattern.
- Keep Creative Pipeline MCP's Premiere surface focused on local QC, typed queue commands, CEP status JSON, and post-export QC.

## Local Direction

Preferred typed CEP command expansion should be small and bounded:

- `trim_clip`
- `split_clip`
- `move_clip`
- `add_marker`
- `set_clip_speed`

Every future command should include:

- `commandId`
- `idempotencyKey`
- `expectedSideEffects`
- `requiresApproval`
- `statusJsonPath`
- `rollbackHint`

Do not add raw ExtendScript, QE DOM, or external MCP full-proxy tools as default public tools.
