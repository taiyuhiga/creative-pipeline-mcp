import { coreTools, McpServer } from "../../core/dist/index.js";
import { assetTools } from "./tools/assetTools.js";

new McpServer("creative-asset-sourcing", "0.3.5-alpha.0", [...coreTools, ...assetTools]).runStdio();
