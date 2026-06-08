import { coreTools, McpServer, providerTools } from "./index.js";

new McpServer("creative-mcp-core", "0.3.6-alpha.0", [...coreTools, ...providerTools]).runStdio();
