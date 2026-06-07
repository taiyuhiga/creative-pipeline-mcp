import { coreTools, McpServer } from "./index.js";

new McpServer("creative-mcp-core", "0.2.16-alpha.0", coreTools).runStdio();
