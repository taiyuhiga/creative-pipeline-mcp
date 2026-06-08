# App Integration Strategy

Creative Pipeline MCP integrates creative apps as providers behind the existing safety model:

```text
typed operation -> artifact -> QC -> approval -> status JSON -> report
```

It does not raw-proxy application APIs. Blender, Premiere, CapCut, After Effects, and Roblox surfaces must stay bounded by named operations, schema validation, workspace restrictions, artifact capture, and approval policy.

## v1 Stable Boundary

The stable v1 claim remains limited to Core, Asset Sourcing, Blender QC/preview/optimize/repair, Premiere media/delivery QC, Dashboard approvals, artifacts, and release gates.

CapCut, After Effects, Roblox, external Blender MCP, live Premiere CEP execution, and future MCP Registry metadata remain experimental until live evidence and stable schemas are available.

## Provider Tracks

| Track | v0.3 status | Default |
| --- | --- | --- |
| Provider Registry | availability/resolution/report tools | enabled |
| CapCut | social draft plan/manifest/QC | manifest-only |
| After Effects | render plan/queue manifest/motion QC | manifest-only |
| Roblox | read-only inspection/QC/command manifests | read-only |

## Prohibited Integration Patterns

- raw ExtendScript, QE DOM, `bpy`, JSX, Studio, or draft-file proxying
- encrypted draft bypasses or binary modification
- external MCP full proxy surfaces
- executor/client-exploit style Roblox tooling
- app license bypasses

## Registry Publishing

An MCP Registry `server.json` can be added after v1 scope is finalized. Pre-v1 metadata should describe CapCut, After Effects, Roblox, and external Blender providers as experimental or provider-specific servers, not as stable core capabilities.
