# GPL Adapters

The GPL adapter package is separate by design.

Use process boundaries:

- command-line calls
- sockets
- temporary JSON files
- Blender addon execution outside the Apache-2.0 core

Optional adapter targets:

- BlenderProc
- BlenderGIS
- Sverchok

Do not directly import GPL implementation code into `packages/core`, `packages/blender-pro-mcp`, or `packages/premiere-pro-mcp`.

