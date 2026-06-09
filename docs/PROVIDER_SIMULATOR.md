# Provider Workflow Simulator

`scripts/simulate-provider-workflows.mjs` runs the provider stack without launching external creative applications.

It covers:

- Provider Registry availability and resolution reports
- CapCut social draft plan, copy-on-write manifest, approved-adapter preflight/run report, and draft QC
- `video.create_edit` Premiere-first provider package with CapCut fallback draft artifacts
- After Effects render plan, frame preview plan, aerender queue manifest, nexrender job manifest, approved-runner execution plan, env-gated approved-runner preflight/run report, render evidence, and motion QC
- Roblox read-only project inspection, place tree, script index, Luau QC, Studio evidence, official Studio MCP session planning, command manifests, and combined project report
- Director social video, motion package, Roblox feature, Roblox trailer, and full production reports

Run it after building:

```bash
npm run build
npm run simulate:providers
```

Default output:

```text
artifacts/examples/provider-simulator/
```

Set `CREATIVE_MCP_PROVIDER_SIM_ARTIFACTS` to override the output directory. The target must stay inside the repository because the simulator clears the directory before writing fresh artifacts.

The simulator writes `providers/provider_workflow_simulation.json` with command coverage, artifact counts, and safety policy evidence.

## Scope

This is a deterministic CI/local simulator. It proves schema validation, artifact creation, provider fallback planning, project-write manifest generation, and raw-proxy policy coverage.

It does not prove live Roblox Studio or Premiere execution. CapCut live adapter execution is only claimed when `CREATIVE_MCP_ENABLE_CAPCUT_APPROVED_ADAPTER=true` and the approved adapter exits successfully. After Effects live execution is only claimed when `CREATIVE_MCP_ENABLE_AE_APPROVED_RUNNER=true` and readable output evidence exists. The Roblox Studio MCP session plan is configuration evidence only; live Studio execution still requires readable status evidence.
