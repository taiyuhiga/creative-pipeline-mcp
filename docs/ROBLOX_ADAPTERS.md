# Roblox Adapters

Roblox support is an experimental game-engine provider for read-only project inspection and Luau QC.

## Tools

- `roblox.check_availability`
- `roblox.inspect_project`
- `roblox.inspect_place_tree`
- `roblox.index_scripts`
- `roblox.validate_luau_project`
- `roblox.sync_rojo`
- `roblox.run_wally_install`
- `roblox.run_selene`
- `roblox.run_stylua_check`
- `roblox.generate_project_report`

## Phase 1 Behavior

Inspection tools read project files under allowed workspace roots. Rojo, Wally, Selene, and StyLua tools write command manifests rather than mutating the project or publishing to Studio.

## Preferred Future Provider

Official Roblox Studio MCP should be preferred for future write operations. WEPPY-style adapters remain optional/reference-only until license and commercial use risks are cleared.
