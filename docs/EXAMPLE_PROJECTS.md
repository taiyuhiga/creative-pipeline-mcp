# Example Projects

Example project manifests live under `examples/projects/`. They are intentionally small and use repository-local examples so they can run in CI or local smoke checks.

## YouTube 16x9 Delivery

Path: `examples/projects/youtube-16x9/project.json`

Use this for Premiere delivery flow checks:

```bash
npm run build
node examples/premiere-project-delivery.mjs
```

The flow creates an OTIO timeline, brand package, export plan, and CEP queue commands.

## Game Asset

Path: `examples/projects/game-asset/project.json`

Use this for Blender asset checks:

```bash
npm run build
node examples/blender-e2e.mjs
```

The flow creates a GLB, renders a preview when Blender is available, optimizes with the configured glTF adapter, and writes QC reports.
