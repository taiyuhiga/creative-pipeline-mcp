# Release Process

## Local Gates

```bash
npm test
npm run check:adapters -- --json
node examples/blender-e2e.mjs
node examples/premiere-qc-e2e.mjs
node examples/premiere-project-delivery.mjs
npm run simulate:premiere-cep -- --queue artifacts/examples/premiere-project-delivery/cep_queue --status artifacts/examples/premiere-project-delivery/cep_status
npm run package:premiere-cep -- --verify
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
dist/premiere-cep/
  creative-pipeline-mcp-premiere-cep-panel-<version>.zip
  premiere-cep-checksums.txt
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

Local publishing requires an authenticated npm session:

```bash
npm publish --provenance --access public
```

GitHub Actions publishing uses npm trusted publishing. Configure npmjs.com with:

```text
Owner: taiyuhiga
Repository: creative-pipeline-mcp
Workflow: npm-publish.yml
Environment: leave empty unless a GitHub environment is added
```

Then set the repository variable `NPM_TRUSTED_PUBLISHING_ENABLED=true`. The workflow publishes from release tags only after tests, adapter checks, Premiere project-delivery example, CEP package verification, npm pack dry-run, and package-version/tag matching pass.

## Semver

- `0.2.x-alpha`: scaffold, safety, docs, adapter gates
- `0.3.x-alpha`: real Blender/Premiere E2E
- `0.4.x-beta`: installers, stable docs, schema tightening
- `1.0.0`: stable tool schemas and artifact schemas
