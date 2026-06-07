import { coreTools, McpServer } from "@creative-pipeline-mcp/core";
import { directorTools } from "./tools.js";

new McpServer("creative-pipeline-director", "0.2.16-alpha.0", [...coreTools, ...directorTools]).runStdio();
