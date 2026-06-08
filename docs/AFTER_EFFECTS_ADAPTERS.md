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

## Backends

- `aerender`
- `nexrender`

The tools write queue/job manifests, approved-runner execution plans, and status JSON. They do not execute raw JSX, create shell-string commands, or bypass licensing.

## Artifact Layout

```text
artifacts/after-effects/
  availability_report.json
  render_plan.json
  frame_preview_plan.json
  render_status.json
  render_evidence.json
  render_execution_plan.json
  motion_qc_report.json
  render_queue/
    aerender_command.json
    nexrender_job.json
```

Render execution evidence should write `render_evidence.json` and then run `ae.run_motion_qc` after completion. `ae.collect_render_evidence` only marks `liveExecutionClaim: true` when the declared output path is readable inside the configured workspace roots.

`ae.prepare_render_execution` writes an argv-array-only `render_execution_plan.json` for an approved external runner. It does not execute `aerender` or `nexrender`; live execution still requires explicit external approval and output evidence.
