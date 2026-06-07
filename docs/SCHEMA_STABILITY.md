# Schema Stability

The package is still alpha, but the public compatibility surface is now tracked by explicit files and release gates. A v1 release must pass these gates without unreviewed schema drift.

## Beta Stability Surface

| Surface | Contract file | Gate |
| --- | --- | --- |
| Tool names | `docs/API_TOOL_SCHEMAS.snapshot.json` | `npm run check:schemas` |
| Input schemas | `docs/API_TOOL_SCHEMAS.snapshot.json` | `npm run check:schemas` |
| `structuredContent` | `docs/API_STABILITY.md` and tests | `npm test` |
| QC report schema | `packages/core/src/qcReport.ts`, `docs/ARTIFACT_SCHEMA.md` | `npm test` |
| Artifact layout | `docs/ARTIFACT_SCHEMA.md` | `npm run check:release` |
| CEP status schema | `docs/CEP_STATUS_SCHEMA.md` and fixtures | `npm test` |

## Change Rules

- Public tool names must not change without updating the snapshot and `docs/MIGRATIONS.md`.
- Input schema changes must reject unknown top-level properties and keep enum values explicit.
- `structuredContent` changes must remain JSON-serializable and covered by tests.
- QC reports must keep `kind`, `target`, `generatedAt`, `summary`, `checks`, and optional `metadata`.
- Artifact layout changes must preserve existing directories or provide migration notes.
- CEP status files must keep `schema`, `commandId`, `commandType`, `status`, `message`, `details`, and timestamp fields.

## v1 Freeze Criteria

Before tagging `v1.0.0`, run:

```bash
npm test
npm run check:schemas
npm run check:v1-freeze
npm run check:release
npm run smoke:npm-install
npm pack --dry-run
```

Then confirm:

- no open blocker issues for macOS and Windows verification
- no uncommitted schema snapshot drift
- migration notes exist for every breaking alpha change
- release notes state whether optional adapters are experimental or stable
