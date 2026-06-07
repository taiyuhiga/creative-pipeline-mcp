# Security Checklist

Use this checklist before beta and stable releases.

## Workspace And Files

- Input paths are restricted to `CREATIVE_MCP_WORKSPACE_ROOTS`.
- Symlinks resolving outside workspace roots are rejected by default.
- Artifact writes cannot escape the artifact root.
- Expected output paths are recorded for elevated operations.

## Dashboard

- Dashboard binds to `127.0.0.1`.
- `CREATIVE_MCP_DASHBOARD_TOKEN` is required.
- Write or rerun endpoints reject missing or invalid tokens.
- Approval reruns are recorded in job history.

## Premiere CEP

- CEP queue commands are typed JSON commands, not arbitrary ExtendScript.
- Raw ExtendScript execution is not exposed through public tools.
- Queue files are processed into status files with a normalized schema.
- Unknown or unreadable CEP results are not silently marked successful.

## Blender

- Raw `bpy` execution is not enabled by default.
- Generated Blender scripts are written as artifacts for review.
- External Blender bridge commands are opt-in and typed.

## Release

- npm package contents are audited with `npm pack --dry-run`.
- public tool schemas are checked with `npm run check:schemas`.
- release assets include checksums.
- signing certificates and private keys stay out of git.
