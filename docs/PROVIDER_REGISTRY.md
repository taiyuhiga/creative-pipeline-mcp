# Provider Registry

The Provider Registry lets higher-level tools decide which creative app backend should handle a workflow without exposing raw app controls.

## Tools

- `provider.check_availability`
- `provider.resolve_video_editor`
- `provider.resolve_motion_engine`
- `provider.resolve_game_engine`
- `provider.write_provider_report`

## Domains

| Domain | Providers |
| --- | --- |
| `video_editor` | Premiere, CapCut |
| `motion_engine` | After Effects, Blender motion |
| `game_engine` | Roblox Studio/Rojo toolchain |

Availability checks use local commands and environment variables only. A provider can be selected as a manifest provider even when the app is not installed, which keeps planning and CI useful on headless machines.

## Policy

Every provider report records:

- `rawProxy: false`
- typed operations only
- artifact-first execution
- approval gates for writes
- post-operation QC requirement

The registry is intentionally small. It selects provider families; it does not expose every app command.

## Simulator

Run `npm run simulate:providers` after `npm run build` to generate deterministic Provider Registry, CapCut, After Effects, Roblox, and Director artifacts under `artifacts/examples/provider-simulator/`.

The simulator proves provider fallback planning, artifact creation, project-write queue manifests, and raw-proxy policy coverage. It does not claim live CapCut, After Effects, Roblox Studio, or Premiere execution.
