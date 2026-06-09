# After Effects Security

After Effects integration must not expose raw scripting by default.

## Guardrails

- raw JSX is disabled by default
- admin approval is required for any future JSX surface
- no license bypass
- no template overwrite by default
- render outputs must be artifact-captured
- queue manifests must include expected side effects and rollback guidance
- live render execution is disabled unless `CREATIVE_MCP_ENABLE_AE_APPROVED_RUNNER=true`
- approved render execution must use argv arrays with `shell: false`
- render output paths must remain inside configured artifact/workspace roots

## v1 Status

After Effects is outside v1 stable. Phase 1 is a render-only experimental provider for planning, queue manifests, preview planning, approved-runner execution, evidence capture, and motion QC.
