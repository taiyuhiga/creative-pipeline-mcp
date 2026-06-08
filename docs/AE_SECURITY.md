# After Effects Security

After Effects integration must not expose raw scripting by default.

## Guardrails

- raw JSX is disabled by default
- admin approval is required for any future JSX surface
- no license bypass
- no template overwrite by default
- render outputs must be artifact-captured
- queue manifests must include expected side effects and rollback guidance

## v1 Status

After Effects is outside v1 stable. Phase 1 is a render-only experimental provider for planning, queue manifests, preview planning, and motion QC.
