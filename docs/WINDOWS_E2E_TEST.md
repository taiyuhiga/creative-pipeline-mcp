# Windows E2E Test

Use this checklist to close the remaining Windows compatibility issues.

## Windows + Blender

Hosted CI coverage:

- `.github/workflows/ci.yml` job `windows-blender-e2e` installs Blender on `windows-latest` and runs `node examples/blender-e2e.mjs`.

Prerequisites:

- Windows 11
- Node.js 24
- Blender installed and available on `PATH`, or `BLENDER_BIN` set to `blender.exe`

Commands:

```powershell
npm ci
npm run build
$env:BLENDER_BIN = "C:\Program Files\Blender Foundation\Blender 4.3\blender.exe"
node examples/blender-e2e.mjs
```

Pass criteria:

- `artifacts/examples/blender-e2e/cube.glb` exists.
- `artifacts/blender/cube_preview.png` exists.
- `artifacts/blender/cube_optimized.glb` exists.
- `artifacts/blender/cube_asset_qc_report.json` exists.
- `blender.render_preview`, `blender.optimize_asset`, and `blender.validate_asset` return successful structuredContent.

## Windows + Premiere CEP

Premiere Pro is not available on hosted GitHub runners, so this remains a manual workstation test.

Prerequisites:

- Windows 11
- Adobe Premiere Pro with CEP support
- Node.js 24
- FFmpeg on `PATH`

Commands:

```powershell
npm ci
npm run build
npm run package:premiere-cep -- --verify
npm run install:premiere-cep
node examples/premiere-project-delivery.mjs
```

Then in Premiere:

1. Open or create a project.
2. Open `Window -> Extensions -> Creative Pipeline MCP`.
3. Set the queue directory to `artifacts/premiere/cep_queue`.
4. Click `Refresh Queue`.
5. Click `Run All Pending`.
6. Click `Refresh Status`.

Pass criteria:

- `build_timeline_from_otio` status is `success`.
- `apply_brand_package` status is `success`.
- `export_sequence` status is `success` or `accepted` with an `outputPath`.
- `premiere.finalize_export_qc` writes an export delivery QC report after the output exists.

## Evidence Format

Append results to `docs/COMPATIBILITY_MATRIX.md`:

```text
OS:
Node:
Blender:
Premiere:
FFmpeg:
Command:
Result:
Artifacts:
Notes:
```
