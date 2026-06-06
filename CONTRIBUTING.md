# Contributing

Keep contributions aligned with the QC-first architecture:

- prefer macro tools over exposing hundreds of low-level tools
- keep GPL code outside Apache-2.0 packages
- add QC checks before adding generation/editing power
- avoid raw script execution unless it is guarded by approval policy
- include tests for new routers, adapters, and report schemas

Run:

```bash
npm install
npm test
```

