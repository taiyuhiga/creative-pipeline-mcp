# After Effects Adapters

After Effects support is an experimental motion/render provider. Phase 1 is render-only and manifest-first.

## Tools

- `ae.check_availability`
- `ae.create_render_plan`
- `ae.queue_aerender`
- `ae.queue_nexrender`
- `ae.render_frame_preview`
- `ae.run_motion_qc`
- `ae.collect_render_evidence`
- `ae.prepare_render_execution`
- `ae.run_approved_render`
- `ae.prepare_template_replacements`
- `ae.prepare_file_bridge`

## Backends

- `aerender`
- `nexrender`

The tools write queue/job manifests, approved-runner execution plans, run reports, evidence, and status JSON. They do not execute raw JSX, create shell-string commands, or bypass licensing.

`ae.run_approved_render` is disabled by default. It runs `aerender` or `nexrender` only when all of these are true:

- `CREATIVE_MCP_ENABLE_AE_APPROVED_RUNNER=true`
- the caller has `project_write` approval
- input preflight passes for the selected engine
- command execution uses an argv array with `shell: false`
- render output stays inside the configured artifact/workspace roots

If the environment flag is not set, the tool writes `render_run_report.json` and `render_status.json` with `blocked_env_disabled` and makes no process call.

## Artifact Layout

```text
artifacts/after-effects/
  availability_report.json
  render_plan.json
  frame_preview_plan.json
  render_status.json
  render_evidence.json
  render_execution_plan.json
  render_run_report.json
  motion_qc_report.json
  render_queue/
    aerender_command.json
    nexrender_job.json
```

Render execution evidence should write `render_evidence.json` and then run `ae.run_motion_qc` after completion. `ae.collect_render_evidence` only marks `liveExecutionClaim: true` when the declared output path is readable inside the configured workspace roots.

`ae.prepare_render_execution` writes an argv-array-only `render_execution_plan.json` for an approved external runner. `ae.run_approved_render` can execute that same bounded render class only when explicitly enabled by environment. Live execution claims are still guarded by readable output evidence.
