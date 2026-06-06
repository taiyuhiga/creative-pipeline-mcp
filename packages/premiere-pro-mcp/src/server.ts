import { coreTools, McpServer } from "@creative-pipeline-mcp/core";
import { premiereTools } from "./tools/mediaTools.js";

new McpServer("premiere-pro-mcp", "0.2.3-alpha.0", [...coreTools, ...premiereTools]).runStdio();
