import { coreTools, McpServer, providerTools } from "../../core/dist/index.js";
import { afterEffectsTools } from "./tools/afterEffectsTools.js";

new McpServer("after-effects-mcp", "1.1.3-alpha.0", [...coreTools, ...providerTools, ...afterEffectsTools]).runStdio();
