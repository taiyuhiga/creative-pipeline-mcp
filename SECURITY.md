# Security Policy

## Supported Branch

Security fixes target `main`.

## Model

The default runtime permission is `safe_write`. Destructive actions, raw script execution, final delivery export, publishing, external upload, cloud sync, shell operations, and GPL adapter activation require explicit elevated configuration or external approval.

Do not connect these servers to untrusted MCP clients. Premiere and Blender bridge adapters can control local creative applications once enabled.

Input paths are restricted to `CREATIVE_MCP_WORKSPACE_ROOTS`. Symlinks that resolve outside those roots are rejected by default; set `CREATIVE_MCP_ALLOW_SYMLINKS=true` only for trusted workspaces.

The dashboard binds to `127.0.0.1` and requires `CREATIVE_MCP_DASHBOARD_TOKEN`. Do not expose it through a proxy or public interface.

## Reporting

Open a private security advisory or contact the repository owner. Do not include private media, project files, credentials, or unpublished client work in public reports.
