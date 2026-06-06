# Safety

Permission levels:

- `read_only`: inspect, index, QC
- `safe_write`: new files, reports, manifests, copies
- `project_write`: edits to current project or export plans
- `destructive`: delete, overwrite, final delivery export, publish
- `admin`: shell, plugin install, system settings

Set the level with `CREATIVE_MCP_PERMISSION`. Default is `safe_write`.
If a tool requires more permission than the current level, the router writes an approval request under `artifacts/approvals/pending/` instead of running the tool.
The dashboard exposes those pending approval records, can move them to resolved approval records with an approve/reject decision, and reruns approved tool calls only with the risk level that was approved.

Set readable input roots with `CREATIVE_MCP_WORKSPACE_ROOTS`. Multiple roots use the platform path delimiter (`:` on macOS/Linux, `;` on Windows). By default only the current working directory is readable.

Always test against copies of production files.
