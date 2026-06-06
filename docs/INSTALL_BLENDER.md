# Blender Install Notes

The alpha QC path does not require Blender for `.glb` and `.gltf` inspection.

For rendered previews, set `BLENDER_BIN` or make `blender` available on `PATH`. `blender.render_preview` will use headless Blender when available and falls back to a placeholder preview when it is not.

For `.blend` inspection, procedural generation, or scene mutation, install Blender separately and connect a trusted external bridge adapter. `blender.create_scene`, `blender.create_asset`, `blender.modify_asset`, `blender.apply_material`, and `blender.create_game_asset` queue bridge commands under `CREATIVE_MCP_BLENDER_IPC_DIR` for that adapter to consume. Keep raw `bpy` execution disabled unless the client and project are trusted.

Default bridge paths:

```text
artifacts/blender/bridge_queue
artifacts/blender/bridge_status
```

Use `blender.read_bridge_status` or `blender.await_bridge_status` to read status JSON written by the bridge adapter. For status records, see `docs/BLENDER_BRIDGE_STATUS_SCHEMA.md`.

Generated bridge queue sample:

```bash
npm run build
node examples/blender-bridge-queue.mjs
```

Worker process:

```bash
npm run blender:bridge-worker -- --once --dry-run
BLENDER_BIN=/Applications/Blender.app/Contents/MacOS/Blender npm run blender:bridge-worker -- --once
```

The worker drains command JSON from the queue, writes normalized status JSON, archives processed commands under `bridge_queue/processed`, and runs generated safe Blender scripts through `BLENDER_BIN` when not in dry-run mode. Use `--queue`, `--status`, `--output`, `--archive`, `--poll-ms`, and `--max-commands` to point it at project-specific paths. Without `--once`, it keeps polling.

Suggested external adapter roles:

- glTF-Transform or gltfpack optimization through `GLTF_TRANSFORM_BIN`, `GLTFPACK_BIN`, or `PATH`
- meshoptimizer and xatlas
- OpenImageIO/OpenColorIO preview and color checks
- optional GPL adapters for BlenderProc, BlenderGIS, and Sverchok
