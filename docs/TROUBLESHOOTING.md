# Troubleshooting

## Adapter Check

```bash
npm run check:adapters -- --json
```

Missing adapters are allowed unless the workflow explicitly depends on them.

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

## Release Assets

```bash
npm run release:assets
gh release upload v<version> dist/release/* --clobber
```
