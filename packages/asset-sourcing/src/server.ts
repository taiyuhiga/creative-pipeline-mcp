import { coreTools, McpServer } from "../../core/dist/index.js";
import { assetTools } from "./tools/assetTools.js";

new McpServer("creative-asset-sourcing", "1.1.5-alpha.0", [...coreTools, ...assetTools]).runStdio();
