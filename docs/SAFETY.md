# Safety

Permission levels:

- `read_only`: inspect, index, QC
- `safe_write`: new files, reports, manifests, copies
- `project_write`: edits to current project or export plans
- `destructive`: delete, overwrite, final delivery export, publish
- `admin`: shell, plugin install, system settings

Set the level with `CREATIVE_MCP_PERMISSION`. Default is `safe_write`.

Always test against copies of production files.

