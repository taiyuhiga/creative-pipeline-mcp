import { coreTools, McpServer, providerTools } from "../../core/dist/index.js";
import { capcutTools } from "./tools/capcutTools.js";

new McpServer("capcut-social-mcp", "1.1.6-alpha.0", [...coreTools, ...providerTools, ...capcutTools]).runStdio();
