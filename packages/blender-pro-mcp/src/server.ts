import { coreTools, McpServer } from "../../core/dist/index.js";
import { blenderTools } from "./tools/assetTools.js";

new McpServer("blender-pro-mcp", "0.2.19-alpha.0", [...coreTools, ...blenderTools]).runStdio();
