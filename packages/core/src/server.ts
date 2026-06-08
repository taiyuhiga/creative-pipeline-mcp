import { coreTools, McpServer } from "./index.js";

new McpServer("creative-mcp-core", "0.2.19-alpha.0", coreTools).runStdio();
