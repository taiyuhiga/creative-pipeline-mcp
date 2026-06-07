import { coreTools, McpServer } from "../../core/dist/index.js";
import { directorTools } from "./tools.js";

new McpServer("creative-pipeline-director", "0.2.18-alpha.0", [...coreTools, ...directorTools]).runStdio();
