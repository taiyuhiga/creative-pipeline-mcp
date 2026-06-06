import { coreTools, McpServer } from "./index.js";

new McpServer("creative-mcp-core", "0.1.0-alpha.0", coreTools).runStdio();
