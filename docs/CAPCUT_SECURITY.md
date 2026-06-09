# CapCut Security

CapCut integration must stay artifact-first and copy-on-write.

## Required Guardrails

- no raw CapCut API proxy
- no encrypted draft bypass
- no CapCut binary modification
- no raw draft overwrite
- no unapproved GUI or cloud write
- all generated draft outputs must be captured in artifacts
- approved adapter execution is disabled unless `CREATIVE_MCP_ENABLE_CAPCUT_APPROVED_ADAPTER=true`
- approved adapter execution must use argv arrays with `shell: false`
- adapter output directories must remain inside configured artifact/workspace roots

## Approval

Manifest and QC tools are `safe_write`. `capcut.run_approved_adapter` is `project_write` and requires approval. Any future tool that writes to a CapCut draft directory, calls a cloud API, or opens the GUI must require approval and must record expected side effects, status path, and rollback guidance.

## v1 Status

CapCut is outside the v1 stable scope. It is an experimental provider track; approved adapter execution remains alpha and must be backed by repeatable evidence before any stable execution claim.
