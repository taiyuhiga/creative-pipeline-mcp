# CapCut Adapters

CapCut support is an experimental social-video provider for draft planning, copy-on-write package handoff, approved CLI adapter execution, and QC. It is designed as a fallback when Premiere is unavailable or when a short-form workflow is better represented as a CapCut draft.

## Tools

- `capcut.check_availability`
- `capcut.create_draft_plan`
- `capcut.write_draft_manifest`
- `capcut.run_draft_qc`
- `capcut.create_social_draft`
- `capcut.resolve_adapter`
- `capcut.export_draft_package`
- `capcut.run_approved_adapter`
- `capcut.run_delivery_qc`

## Optional Backends

The implementation records availability, writes artifacts, and can run bounded CLI-style adapters only when explicitly enabled. Optional execution adapters may wrap:

- `capcut-cli`
- `pyJianYingDraft`

Cloud or GUI bridges such as CapCutAPI, CapCut Mate, and `cut_cli` remain reference/planning targets only. They are not executed by `capcut.run_approved_adapter`.

`capcut.run_approved_adapter` is disabled by default. It runs only when all of these are true:

- `CREATIVE_MCP_ENABLE_CAPCUT_APPROVED_ADAPTER=true`
- the caller has `project_write` approval
- `draftManifestPath` is readable inside `CREATIVE_MCP_WORKSPACE_ROOTS`
- the backend/operation pair is allowlisted
- command execution uses an argv array with `shell: false`
- output stays inside configured artifact/workspace roots

If the environment flag is not set, the tool writes `adapter_run_report.json` and `draft_status.json` with `blocked_env_disabled` and makes no process call.

## Artifact Layout

```text
artifacts/capcut/
  availability_report.json
  draft_plan.json
  draft_manifest.json
  draft_qc_report.json
  draft_package_manifest.json
  adapter_run_report.json
  draft_status.json
  delivery_qc_report.json
```

Draft plans are copy-on-write. Source media is referenced, not modified.
