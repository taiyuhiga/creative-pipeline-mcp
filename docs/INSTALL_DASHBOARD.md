# Dashboard

The dashboard is a local-only artifact, preview, job-history, and approval viewer. It can approve elevated tool requests and rerun the approved tool, so it must not be exposed to a network.

## Start

```bash
CREATIVE_MCP_DASHBOARD_TOKEN=change-me npm run start:dashboard
```

Open:

```text
http://127.0.0.1:4173/?token=change-me
```

The server binds to `127.0.0.1` only. `CREATIVE_MCP_DASHBOARD_TOKEN` is required. API requests must send the token as `x-creative-mcp-dashboard-token` or as the `token` query parameter.

## APIs

- `GET /api/reports`
- `GET /api/artifacts`
- `GET /api/artifacts/file?path=<artifact-relative-path>`
- `GET /api/jobs`
- `GET /api/approvals`
- `POST /api/approvals/resolve`

## Approval Risk

Approving a pending request can rerun a `project_write`, `destructive`, or `admin` tool with the stored input. Review the request JSON before approving.

Reject requests that:

- reference unexpected source paths
- request broad workspace access
- target production project files directly
- request raw script, shell, publishing, upload, or sync behavior

## Environment

```text
PORT=4173
CREATIVE_MCP_ARTIFACTS=artifacts
CREATIVE_MCP_DASHBOARD_TOKEN=change-me
```

Do not proxy this dashboard or bind it to public interfaces.
