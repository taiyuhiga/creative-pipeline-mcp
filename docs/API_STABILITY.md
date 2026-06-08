# API Stability

The current package is alpha. Public tool schemas are strict, but not frozen.

For the current beta/v1 readiness contract, see `docs/SCHEMA_STABILITY.md`. Public schema and artifact changes that require user action should be recorded in `docs/MIGRATIONS.md`.

## Intended v1 Freeze Surface

- tool names
- required input fields
- top-level input property rejection
- `structuredContent` output shape
- QC report schema
- artifact layout
- CEP status schema
- typed Premiere CEP command safety metadata
- approval artifact shape

## `structuredContent` Shape

Every public `tools/call` response mirrors the internal `ToolResult` object in `structuredContent`:

```json
{
  "ok": true,
  "message": "human readable status",
  "artifacts": ["artifacts/example.json"],
  "data": {}
}
```

`ok` and `message` are required. `artifacts` is optional and must contain artifact paths when present. `data` is optional and must be JSON-serializable. The MCP text content uses the same `message`, while `structuredContent` is the stable machine-readable surface.

## Snapshot Gate

`docs/API_TOOL_SCHEMAS.snapshot.json` records the current public tool names, risks, descriptions, and input schemas. CI and local release gates should run:

```bash
npm run build
npm run check:schemas
npm run check:release
```

If an intentional public schema change is made, regenerate the snapshot and include migration notes in the same change.

## Experimental Surface

Adapters that depend on optional external tools remain experimental until v1 unless explicitly marked stable:

- Blender bridge commands
- Premiere CEP host commands
- Premiere live CEP editing/export execution
- WhisperX adapter tools
- PySceneDetect adapter tools
- pyloudnorm adapter tools
- VMAF scoring
- GPL-separated adapter manifests
- external Blender MCP adapters

For the stable and experimental v1 release boundaries, see `docs/V1_SCOPE.md`.

## Deprecation Policy Draft

Before v1, breaking changes may happen in alpha releases. After v1:

- additive fields are allowed in minor releases
- removed fields require a deprecation notice first
- renamed tools require a compatibility alias for at least one minor release
- schema-breaking changes require a major version
