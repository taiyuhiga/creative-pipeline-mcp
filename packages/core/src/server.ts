import { coreTools, McpServer, providerTools } from "./index.js";

new McpServer("creative-mcp-core", "1.1.9-alpha.0", [...coreTools, ...providerTools]).runStdio();
