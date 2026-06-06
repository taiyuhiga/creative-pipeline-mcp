import { coreTools, McpServer } from "@creative-pipeline-mcp/core";
import { directorTools } from "./tools.js";

new McpServer("creative-pipeline-director", "2.0.0", [...coreTools, ...directorTools]).runStdio();
