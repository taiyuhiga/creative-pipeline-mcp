import { coreTools, McpServer, providerTools } from "../../core/dist/index.js";
import { afterEffectsTools } from "./tools/afterEffectsTools.js";

new McpServer("after-effects-mcp", "1.0.0", [...coreTools, ...providerTools, ...afterEffectsTools]).runStdio();
