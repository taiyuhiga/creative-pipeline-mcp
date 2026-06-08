# Roblox Workflow

## Feature QC

```text
provider.resolve_game_engine
roblox.inspect_project
roblox.inspect_place_tree
roblox.index_scripts
roblox.validate_luau_project
roblox.collect_studio_evidence
roblox.generate_project_report
```

## Command Manifest Flow

```text
roblox.sync_rojo
roblox.run_wally_install
roblox.run_selene
roblox.run_stylua_check
```

These tools write manifests. They do not execute commands in the current alpha.

## Trailer Flow

```text
roblox.generate_project_report
provider.resolve_video_editor
director.create_roblox_trailer
premiere.build_project_delivery or capcut.create_social_draft
```

The trailer workflow links Roblox QC evidence to video delivery artifacts.

## Studio Evidence Flow

```text
roblox.collect_studio_evidence
```

This records read-only Studio evidence into `roblox/studio_evidence.json`. A live Studio integration claim is guarded by a readable status evidence JSON plus `status: success`; pending/manual evidence remains useful for release reports but does not claim execution.
