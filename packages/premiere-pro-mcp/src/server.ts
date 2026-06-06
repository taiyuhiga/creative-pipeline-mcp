import { coreTools, McpServer } from "@creative-pipeline-mcp/core";
import { premiereTools } from "./tools/mediaTools.js";

new McpServer("premiere-pro-mcp", "1.0.0", [...coreTools, ...premiereTools]).runStdio();

