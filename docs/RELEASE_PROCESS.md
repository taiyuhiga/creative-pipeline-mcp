# Release Process

## Local Gates

```bash
npm test
npm run check:adapters -- --json
node examples/blender-e2e.mjs
node examples/premiere-qc-e2e.mjs
npm pack --dry-run
```

## Assets

Generate release assets:

```bash
npm run release:assets
```

This writes:

```text
dist/release/
  creative-pipeline-mcp-<version>.tgz
  creative-pipeline-mcp-example-artifacts-<version>.zip
  checksums.txt
```

Upload:

```bash
gh release upload v<version> dist/release/* --clobber
```

## npm Publish Readiness

Check name and package metadata:

```bash
npm view creative-pipeline-mcp version
npm pack --dry-run
npm publish --dry-run --provenance
```

Publish only after CI is green and the GitHub release exists:

```bash
npm publish --provenance --access public
```

## Semver

- `0.2.x-alpha`: scaffold, safety, docs, adapter gates
- `0.3.x-alpha`: real Blender/Premiere E2E
- `0.4.x-beta`: installers, stable docs, schema tightening
- `1.0.0`: stable tool schemas and artifact schemas
