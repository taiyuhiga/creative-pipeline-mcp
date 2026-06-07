# API Stability

The current package is alpha. Public tool schemas are strict, but not frozen.

## Intended v1 Freeze Surface

- tool names
- required input fields
- top-level input property rejection
- `structuredContent` output shape
- QC report schema
- artifact layout
- CEP status schema
- approval artifact shape

## Experimental Surface

Adapters that depend on optional external tools remain experimental until v1 unless explicitly marked stable:

- Blender bridge commands
- Premiere CEP host commands
- WhisperX adapter tools
- PySceneDetect adapter tools
- pyloudnorm adapter tools
- VMAF scoring
- GPL-separated adapter manifests

## Deprecation Policy Draft

Before v1, breaking changes may happen in alpha releases. After v1:

- additive fields are allowed in minor releases
- removed fields require a deprecation notice first
- renamed tools require a compatibility alias for at least one minor release
- schema-breaking changes require a major version

