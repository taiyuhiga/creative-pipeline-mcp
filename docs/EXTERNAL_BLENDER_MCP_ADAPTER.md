# External Blender MCP Adapter

The external Blender MCP adapter is experimental and disabled by default. It is intended for trusted local Blender MCP servers such as `dcc-mcp-blender`, while Creative Pipeline MCP remains the schema validation, approval, artifact, and QC layer.

## Configuration

```bash
CREATIVE_MCP_ENABLE_EXTERNAL_BLENDER_MCP=true
CREATIVE_MCP_EXTERNAL_BLENDER_MCP_URL=http://127.0.0.1:8765/mcp
CREATIVE_MCP_EXTERNAL_BLENDER_MCP_ALLOW=health,import,preview,export,transform,validate
```

Optional tool-name overrides:

```bash
CREATIVE_MCP_EXTERNAL_BLENDER_MCP_IMPORT_TOOL=blender.import_asset
CREATIVE_MCP_EXTERNAL_BLENDER_MCP_PREVIEW_TOOL=blender.render_preview
CREATIVE_MCP_EXTERNAL_BLENDER_MCP_EXPORT_TOOL=blender.export_asset
CREATIVE_MCP_EXTERNAL_BLENDER_MCP_TRANSFORM_TOOL=blender.apply_transform
CREATIVE_MCP_EXTERNAL_BLENDER_MCP_VALIDATE_TOOL=blender.validate_scene
```

Write operations require approval by default. To disable that for a trusted local fixture only:

```bash
CREATIVE_MCP_EXTERNAL_BLENDER_MCP_REQUIRE_APPROVAL=false
```

## Public Tools

- `blender.external_adapter_health`
- `blender.external_import_asset`
- `blender.external_render_preview`
- `blender.external_export_asset`
- `blender.external_apply_transform`
- `blender.external_validate_scene`

These tools call the configured MCP endpoint through bounded `tools/list` and `tools/call` requests. Users cannot choose arbitrary external tool names at runtime.

## Safety Policy

- disabled unless `CREATIVE_MCP_ENABLE_EXTERNAL_BLENDER_MCP=true`
- no `external_raw_call` public tool
- no `execute_python`, `execute_blender_code`, or full external proxy
- external operations are allowlisted by operation name
- import, preview, export, transform, and validate calls are represented as typed Creative Pipeline MCP tools
- preview/export/transform outputs are directed into `ArtifactStore`
- import and validate calls capture request/response artifacts and run local source QC where supported
- export and transform outputs are rechecked with local `blender.validate_asset`-style QC when the output is `.glb` or `.gltf`
- unsupported output formats are captured as artifacts but not claimed as locally QC-complete

## Adapter Contract

Health uses:

```json
{ "jsonrpc": "2.0", "method": "tools/list", "params": {} }
```

Import, preview, export, transform, and validate use:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "blender.render_preview",
    "arguments": {
      "sourcePath": "/absolute/source.gltf",
      "outputPath": "/absolute/artifacts/blender/source_external_preview.png"
    }
  }
}
```

The external server should write to the provided `outputPath`. Creative Pipeline MCP then captures the artifact path and writes a request manifest plus local QC report where supported.
