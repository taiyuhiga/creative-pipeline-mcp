# Troubleshooting

## Adapter Check

```bash
npm run check:adapters -- --json
```

Missing adapters are allowed unless the workflow explicitly depends on them.

If `ffmpeg-libvmaf` is missing, install an FFmpeg build that includes the `libvmaf` filter. `premiere.measure_vmaf` still writes an adapter report when the filter is unavailable.

## npm Install

If `npm install creative-pipeline-mcp` installs an older alpha, use the alpha dist-tag explicitly:

```bash
npm install creative-pipeline-mcp@alpha
npm view creative-pipeline-mcp dist-tags --json
```

Before v1 stable, the unqualified npm package name must not be treated as the newest build. The current supported pre-release install path is `creative-pipeline-mcp@alpha`.

## Dashboard

If the dashboard refuses API requests, confirm the token:

```bash
CREATIVE_MCP_DASHBOARD_TOKEN=change-me npm run start:dashboard
curl -H "x-creative-mcp-dashboard-token: change-me" http://127.0.0.1:4173/api/reports
```

The dashboard only accepts localhost host headers.

## Workspace Paths

If an input path is rejected:

- confirm it is under `CREATIVE_MCP_WORKSPACE_ROOTS`
- avoid symlinks to files outside the workspace
- set `CREATIVE_MCP_ALLOW_SYMLINKS=true` only for trusted workspaces

## Premiere CEP

If a command remains pending:

- confirm the panel queue directory points to `artifacts/premiere/cep_queue`
- click refresh queue in the CEP panel
- run selected or all pending commands
- inspect `artifacts/premiere/cep_status`

If sequence creation fails:

- confirm a Premiere project is open and the CEP panel has focus at least once
- inspect the `build_timeline_from_otio` status file for `message` and `details.error`
- confirm every OTIO `media_reference.target_url` exists and is readable
- open or create an active sequence manually, then rerun the queued command
- if `app.project.createNewSequence` fails, keep the status artifact and use the imported media count in `details.imported` to distinguish import failure from sequence creation failure

If export QC does not finish:

- run `premiere.watch_export_output` with the `commandId` from the `export_sequence` status
- verify `details.outputPath` exists on disk after Adobe Media Encoder finishes
- rerun `premiere.finalize_export_qc` with explicit `outputPath` when the status file lacks one

## Release Assets

```bash
npm run release:assets
gh release upload v<version> dist/release/* --clobber
```
