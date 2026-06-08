import { coreTools, McpServer, providerTools } from "./index.js";

new McpServer("creative-mcp-core", "0.3.2-alpha.0", [...coreTools, ...providerTools]).runStdio();
