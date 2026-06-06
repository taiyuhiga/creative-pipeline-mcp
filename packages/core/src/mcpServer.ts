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

class JsonRpcError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message);
  }
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
    if (!isRecord(request) || request.jsonrpc !== undefined && request.jsonrpc !== "2.0" || typeof request.method !== "string") {
      throw new JsonRpcError(-32600, "Invalid JSON-RPC request");
    }
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
      if (!isRecord(params) || typeof params.name !== "string") {
        throw new JsonRpcError(-32602, "tools/call requires params.name");
      }
      const name = String(params.name ?? "");
      const input = (params.arguments ?? {}) as Record<string, unknown>;
      if (!isRecord(input)) {
        throw new JsonRpcError(-32602, "tools/call params.arguments must be an object");
      }
      let result;
      try {
        result = await this.router.run(name, this.context, input);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Unknown tool:")) {
          throw new JsonRpcError(-32602, error.message);
        }
        throw error;
      }
      return {
        content: [{ type: "text", text: result.message }],
        structuredContent: result
      };
    }
    throw new JsonRpcError(-32601, `Method not found: ${request.method}`);
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
      try {
        request = JSON.parse(line) as JsonRpcRequest;
      } catch (error) {
        throw new JsonRpcError(-32700, error instanceof Error ? error.message : String(error));
      }
      const result = await this.handle(request);
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id ?? null, result })}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof JsonRpcError ? error.code : -32000;
      process.stdout.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: request?.id ?? null,
          error: { code, message }
        })}\n`
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
