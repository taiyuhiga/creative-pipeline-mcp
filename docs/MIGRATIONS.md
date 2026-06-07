# Migration Notes

This file tracks public schema and artifact-layout changes that users may need to react to.

## 0.2.16-alpha.0

- Public tool input schemas are snapshot-gated by `docs/API_TOOL_SCHEMAS.snapshot.json`.
- Top-level unknown tool input properties are rejected by the router.
- CEP status records use `creative.pipeline.premiere.status.v1` and normalize legacy status files through the status reader.
- Dashboard artifact and job APIs are token-protected and local-only.

## Future Change Template

```text
## <version>

Changed:
- 

Migration:
- 

Compatibility:
- 
```
