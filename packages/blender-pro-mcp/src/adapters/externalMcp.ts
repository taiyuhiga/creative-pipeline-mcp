export type ExternalBlenderOperation = "health" | "preview" | "export";

export interface ExternalBlenderMcpConfig {
  enabled: boolean;
  url?: string;
  allowedOperations: ExternalBlenderOperation[];
  requireApprovalForWrite: boolean;
  toolNames: Record<Exclude<ExternalBlenderOperation, "health">, string>;
}

export interface ExternalBlenderMcpCall {
  operation: ExternalBlenderOperation;
  arguments?: Record<string, unknown>;
}

export interface ExternalBlenderMcpResult {
  ok: boolean;
  operation: ExternalBlenderOperation;
  method: "tools/list" | "tools/call";
  toolName?: string;
  response?: unknown;
  error?: string;
}

const ALLOWED_OPERATIONS: ExternalBlenderOperation[] = ["health", "preview", "export"];

export function externalBlenderMcpConfig(): ExternalBlenderMcpConfig {
  return {
    enabled: process.env.CREATIVE_MCP_ENABLE_EXTERNAL_BLENDER_MCP === "true",
    url: process.env.CREATIVE_MCP_EXTERNAL_BLENDER_MCP_URL,
    allowedOperations: parseAllowedOperations(process.env.CREATIVE_MCP_EXTERNAL_BLENDER_MCP_ALLOW),
    requireApprovalForWrite: process.env.CREATIVE_MCP_EXTERNAL_BLENDER_MCP_REQUIRE_APPROVAL !== "false",
    toolNames: {
      preview: process.env.CREATIVE_MCP_EXTERNAL_BLENDER_MCP_PREVIEW_TOOL ?? "blender.render_preview",
      export: process.env.CREATIVE_MCP_EXTERNAL_BLENDER_MCP_EXPORT_TOOL ?? "blender.export_asset"
    }
  };
}

export function externalBlenderMcpUnavailableReason(config = externalBlenderMcpConfig()): string | undefined {
  if (!config.enabled) {
    return "CREATIVE_MCP_ENABLE_EXTERNAL_BLENDER_MCP is not true";
  }
  if (!config.url) {
    return "CREATIVE_MCP_EXTERNAL_BLENDER_MCP_URL is not set";
  }
  return undefined;
}

export async function callExternalBlenderMcp(
  call: ExternalBlenderMcpCall,
  config = externalBlenderMcpConfig()
): Promise<ExternalBlenderMcpResult> {
  const unavailable = externalBlenderMcpUnavailableReason(config);
  if (unavailable) {
    return { ok: false, operation: call.operation, method: call.operation === "health" ? "tools/list" : "tools/call", error: unavailable };
  }
  if (!config.allowedOperations.includes(call.operation)) {
    return {
      ok: false,
      operation: call.operation,
      method: call.operation === "health" ? "tools/list" : "tools/call",
      error: `External Blender MCP operation is not allowlisted: ${call.operation}`
    };
  }

  const request = buildJsonRpcRequest(call, config);
  try {
    const response = await fetch(config.url as string, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) as Record<string, unknown> : {};
    const error = parsed.error;
    return {
      ok: response.ok && !error,
      operation: call.operation,
      method: request.method,
      toolName: request.params && "name" in request.params ? String(request.params.name) : undefined,
      response: parsed,
      error: response.ok ? formatJsonRpcError(error) : `HTTP ${response.status}: ${text}`
    };
  } catch (error) {
    return {
      ok: false,
      operation: call.operation,
      method: request.method,
      toolName: request.params && "name" in request.params ? String(request.params.name) : undefined,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function buildJsonRpcRequest(call: ExternalBlenderMcpCall, config: ExternalBlenderMcpConfig) {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  if (call.operation === "health") {
    return {
      jsonrpc: "2.0",
      id,
      method: "tools/list" as const,
      params: {}
    };
  }
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call" as const,
    params: {
      name: config.toolNames[call.operation],
      arguments: call.arguments ?? {}
    }
  };
}

function parseAllowedOperations(value: string | undefined): ExternalBlenderOperation[] {
  if (!value) {
    return ALLOWED_OPERATIONS;
  }
  const parsed = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is ExternalBlenderOperation => ALLOWED_OPERATIONS.includes(entry as ExternalBlenderOperation));
  return parsed.length > 0 ? parsed : ["health"];
}

function formatJsonRpcError(error: unknown): string | undefined {
  if (!error) {
    return undefined;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return JSON.stringify(error);
}
