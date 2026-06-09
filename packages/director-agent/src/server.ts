import { coreTools, McpServer } from "../../core/dist/index.js";
import { directorTools } from "./tools.js";

new McpServer("creative-pipeline-director", "1.1.7-alpha.0", [...coreTools, ...directorTools]).runStdio();
