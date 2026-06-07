# FAQ

## Is this production-ready?

It is an alpha MCP pipeline. The package has CI, schema snapshots, adapter checks, signed CEP packaging, dashboard approval flow, and local macOS Premiere E2E evidence. Production use still requires environment-specific Blender/Premiere verification, trusted signing, and stable v1 schema freeze.

## Does it run Blender directly?

Some Blender workflows run locally when `BLENDER_BIN` is configured. Otherwise the tools write safe artifacts and queue typed bridge commands for a trusted external Blender adapter.

## Does it run arbitrary Blender Python?

No public tool exposes raw `bpy` execution by default. Generated scripts come from bounded templates and are written as artifacts for review.

## Does it run arbitrary Premiere ExtendScript?

No. The CEP panel accepts allowlisted JSON command types and rejects unsupported commands.

## Where are outputs written?

Artifacts are written under `artifacts/` by default. Set `CREATIVE_MCP_ARTIFACTS` for the dashboard and package-specific artifact roots where supported.

## How are source paths restricted?

Use `CREATIVE_MCP_WORKSPACE_ROOTS` to constrain readable input files. The artifact store rejects files outside those roots and rejects symlinks that resolve outside roots by default.

## How do elevated operations work?

Tools with `project_write`, `destructive`, or `admin` risk require enough permission. If permission is too low, the router writes an approval artifact under `approvals/pending` and an audit artifact under `approvals/audit`.

## How do I inspect pending approvals?

Start the dashboard with `CREATIVE_MCP_DASHBOARD_TOKEN` and open `http://127.0.0.1:4173/?token=<token>`.

## What happens when optional adapters are missing?

The tool writes an adapter manifest or report with a structured `adapter_missing` error. Missing optional adapters should not crash the MCP server.

## How do I validate a release?

Run:

```bash
npm run check:schemas
npm test
npm pack --dry-run
```
