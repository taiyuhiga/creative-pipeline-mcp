# Provider Workflow Simulator

`scripts/simulate-provider-workflows.mjs` runs the provider stack without launching external creative applications.

It covers:

- Provider Registry availability and resolution reports
- CapCut social draft plan, copy-on-write manifest, and draft QC
- `video.create_edit` Premiere-first provider package with CapCut fallback draft artifacts
- After Effects render plan, frame preview plan, aerender queue manifest, nexrender job manifest, and motion QC
- Roblox read-only project inspection, place tree, script index, Luau QC, command manifests, and combined project report
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

It does not prove live CapCut, After Effects, Roblox Studio, or Premiere execution. Those remain experimental until live runtime evidence exists.
