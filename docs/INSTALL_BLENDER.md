# Blender Install Notes

The alpha QC path does not require Blender for `.glb` and `.gltf` inspection.

For rendered previews, `.blend` inspection, procedural generation, or scene mutation, install Blender separately and connect an external bridge adapter. Keep raw `bpy` execution disabled unless the client and project are trusted.

Suggested external adapter roles:

- live/headless Blender bridge
- glTF-Transform or gltfpack optimization
- meshoptimizer and xatlas
- OpenImageIO/OpenColorIO preview and color checks
- optional GPL adapters for BlenderProc, BlenderGIS, and Sverchok

