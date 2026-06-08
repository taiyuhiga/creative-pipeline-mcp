# MCP Registry Metadata

`server.json` describes the public npm package for MCP Registry and downstream marketplace discovery.

The root package is the registry-owned package:

```text
server name: io.github.taiyuhiga/creative-pipeline-mcp
npm package: creative-pipeline-mcp
transport: stdio
```

The npm package includes `mcpName` in `package.json`; this must stay equal to `server.json` `name` so registry ownership verification can confirm the package maps to this server.

## Stable And Experimental Scope

The registry entry points at the package, not at a single raw app-control surface. The stable v1 package scope is still the QC-first surface documented in `docs/V1_SCOPE.md`.

Stable:

- core registry/router/artifact/approval/schema validation
- provider planning and reports
- asset provenance and license manifests
- Blender GLB/glTF QC and artifact planning
- Premiere media/delivery QC and typed CEP queue generation
- dashboard artifact/QC/approval/provider review

Experimental:

- Premiere live CEP editing/export in a real project
- CapCut draft provider execution
- After Effects render execution
- Roblox Studio live execution
- external Blender MCP and optional external adapters

## Client Config Examples

Use the examples under `examples/mcp/` as starting points:

- `claude_desktop_config.json`
- `cursor_mcp_config.json`
- `vscode_mcp_config.json`

For the latest stable release, omit `@alpha`. For the newest experimental provider tools, keep `creative-pipeline-mcp@alpha`.

## Publish Checklist

Before submitting registry metadata:

```bash
npm test
npm run check:schemas
npm run check:v1-freeze
npm run check:release
npm pack --dry-run
```

Also verify:

- `server.json` `version` matches `package.json`.
- `server.json` `name` matches `package.json` `mcpName`.
- package `files` includes `server.json`.
- pre-release packages are described as experimental where appropriate.
