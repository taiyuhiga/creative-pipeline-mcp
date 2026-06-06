# Blender Install Notes

The alpha QC path does not require Blender for `.glb` and `.gltf` inspection.

For rendered previews, set `BLENDER_BIN` or make `blender` available on `PATH`. `blender.render_preview` will use headless Blender when available and falls back to a placeholder preview when it is not.

For `.blend` inspection, procedural generation, or scene mutation, install Blender separately and connect a trusted external bridge adapter. Keep raw `bpy` execution disabled unless the client and project are trusted.

Suggested external adapter roles:

- live/headless Blender bridge
- glTF-Transform or gltfpack optimization through `GLTF_TRANSFORM_BIN`, `GLTFPACK_BIN`, or `PATH`
- meshoptimizer and xatlas
- OpenImageIO/OpenColorIO preview and color checks
- optional GPL adapters for BlenderProc, BlenderGIS, and Sverchok
