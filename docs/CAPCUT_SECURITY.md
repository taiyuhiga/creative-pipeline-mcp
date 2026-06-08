# CapCut Security

CapCut integration must stay artifact-first and copy-on-write.

## Required Guardrails

- no raw CapCut API proxy
- no encrypted draft bypass
- no CapCut binary modification
- no raw draft overwrite
- no unapproved GUI or cloud write
- all generated draft outputs must be captured in artifacts

## Approval

Manifest and QC tools are `safe_write`. Any future tool that writes to a CapCut draft directory, calls a cloud API, or opens the GUI must require approval and must record expected side effects, status path, and rollback guidance.

## v1 Status

CapCut is outside the v1 stable scope. It is an experimental provider track until an execution backend is verified with repeatable evidence.
