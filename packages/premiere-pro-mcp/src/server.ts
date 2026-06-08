import { coreTools, McpServer } from "../../core/dist/index.js";
import { premiereTools } from "./tools/mediaTools.js";

new McpServer("premiere-pro-mcp", "0.3.3-alpha.0", [...coreTools, ...premiereTools]).runStdio();
