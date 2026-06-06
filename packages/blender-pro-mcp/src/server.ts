import { coreTools, McpServer } from "@creative-pipeline-mcp/core";
import { blenderTools } from "./tools/assetTools.js";

new McpServer("blender-pro-mcp", "0.2.4-alpha.0", [...coreTools, ...blenderTools]).runStdio();
