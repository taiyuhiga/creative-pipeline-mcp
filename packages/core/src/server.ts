import { coreTools, McpServer, providerTools } from "./index.js";

new McpServer("creative-mcp-core", "1.1.8-alpha.0", [...coreTools, ...providerTools]).runStdio();
