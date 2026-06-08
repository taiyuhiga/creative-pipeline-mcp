import { coreTools, McpServer, providerTools } from "../../core/dist/index.js";
import { robloxTools } from "./tools/robloxTools.js";

new McpServer("roblox-pro-mcp", "0.3.4-alpha.0", [...coreTools, ...providerTools, ...robloxTools]).runStdio();
