# Roblox Adapters

Roblox support is an experimental game-engine provider for read-only project inspection and Luau QC.

## Tools

- `roblox.check_availability`
- `roblox.inspect_project`
- `roblox.inspect_place_tree`
- `roblox.index_scripts`
- `roblox.validate_luau_project`
- `roblox.collect_studio_evidence`
- `roblox.prepare_studio_mcp_session`
- `roblox.sync_rojo`
- `roblox.run_wally_install`
- `roblox.run_selene`
- `roblox.run_stylua_check`
- `roblox.generate_project_report`

## Phase 1 Behavior

Inspection tools read project files under allowed workspace roots. Rojo, Wally, Selene, and StyLua tools write command manifests rather than mutating the project or publishing to Studio.

`roblox.collect_studio_evidence` records Studio status evidence from a manual run, self-hosted runner, or future official Studio MCP status artifact. It sets `liveStudioClaim: true` only when a readable status evidence JSON exists under the allowed workspace roots and the declared status is `success`.

`roblox.prepare_studio_mcp_session` writes an official Studio MCP stdio session plan plus a client config artifact. It does not connect to Studio, execute Studio tools, publish places, or expose a raw Studio proxy. Read-only sessions allow session management, data-model reads, and script reads by default; playtest and limited-write groups require explicit mode selection and approval evidence.

## Preferred Future Provider

Official Roblox Studio MCP should be preferred for future write operations. WEPPY-style adapters remain optional/reference-only until license and commercial use risks are cleared.
