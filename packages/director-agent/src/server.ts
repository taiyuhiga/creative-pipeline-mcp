import { coreTools, McpServer } from "../../core/dist/index.js";
import { directorTools } from "./tools.js";

new McpServer("creative-pipeline-director", "1.1.4-alpha.0", [...coreTools, ...directorTools]).runStdio();
