import { coreTools, McpServer } from "./index.js";

new McpServer("creative-mcp-core", "0.1.1-alpha.0", coreTools).runStdio();
