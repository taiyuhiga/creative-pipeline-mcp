import { createInterface } from "node:readline";
import { ArtifactStore } from "./artifactStore.js";
import { ApprovalPolicy, permissionFromEnv } from "./approvalPolicy.js";
import { defaultLicenseManifest } from "./licenseManifest.js";
import { Router } from "./router.js";
import { ToolRegistry } from "./toolRegistry.js";
import type { ToolDefinition, ToolExecutionContext } from "./types.js";

interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export class McpServer {
  private readonly registry = new ToolRegistry();
  private readonly router = new Router(this.registry);
  private readonly context: ToolExecutionContext;

  constructor(
    private readonly name: string,
    private readonly version: string,
    tools: ToolDefinition[]
  ) {
    this.registry.registerMany(tools);
    this.context = {
      artifactStore: new ArtifactStore(),
      approvalPolicy: new ApprovalPolicy(permissionFromEnv()),
      licenseManifest: defaultLicenseManifest(),
      logger: {
        log: (event, detail) => {
          void this.context.artifactStore.writeJson(`logs/${Date.now()}-${event}.json`, detail);
        }
      }
    };
  }

  async handle(request: JsonRpcRequest): Promise<unknown> {
    if (request.method === "initialize") {
      return {
        protocolVersion: "2025-06-18",
        serverInfo: { name: this.name, version: this.version },
        capabilities: { tools: {} }
      };
    }
    if (request.method === "ping") {
      return {};
    }
    if (request.method === "tools/list") {
      return {
        tools: this.registry.list().map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      };
    }
    if (request.method === "tools/call") {
      const params = request.params ?? {};
      const name = String(params.name ?? "");
      const input = (params.arguments ?? {}) as Record<string, unknown>;
      const result = await this.router.run(name, this.context, input);
      return {
        content: [{ type: "text", text: result.message }],
        structuredContent: result
      };
    }
    throw new Error(`Unsupported method: ${request.method}`);
  }

  runStdio(): void {
    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
    rl.on("line", (line) => {
      if (!line.trim()) {
        return;
      }
      void this.respond(line);
    });
  }

  private async respond(line: string): Promise<void> {
    let request: JsonRpcRequest | undefined;
    try {
      request = JSON.parse(line) as JsonRpcRequest;
      const result = await this.handle(request);
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id ?? null, result })}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: request?.id ?? null,
          error: { code: -32000, message }
        })}\n`
      );
    }
  }
}
