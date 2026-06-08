# After Effects Adapters

After Effects support is an experimental motion/render provider. Phase 1 is render-only and manifest-first.

## Tools

- `ae.check_availability`
- `ae.create_render_plan`
- `ae.queue_aerender`
- `ae.queue_nexrender`
- `ae.render_frame_preview`
- `ae.run_motion_qc`

## Backends

- `aerender`
- `nexrender`

The tools write queue/job manifests and status JSON. They do not execute raw JSX or bypass licensing.

## Artifact Layout

```text
artifacts/after-effects/
  availability_report.json
  render_plan.json
  frame_preview_plan.json
  render_status.json
  motion_qc_report.json
  render_queue/
    aerender_command.json
    nexrender_job.json
```

Future render execution should write `output.mov` or image-sequence artifacts and run `ae.run_motion_qc` after completion.
