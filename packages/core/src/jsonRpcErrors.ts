export const JSON_RPC_ERRORS = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  toolExecutionError: -32000
} as const;

export type JsonRpcErrorCode = typeof JSON_RPC_ERRORS[keyof typeof JSON_RPC_ERRORS];

export const STRUCTURED_TOOL_ERROR_CODES = {
  adapterMissing: "adapter_missing",
  approvalRequired: "approval_required",
  invalidToolInput: "invalid_tool_input"
} as const;

export type StructuredToolErrorCode = typeof STRUCTURED_TOOL_ERROR_CODES[keyof typeof STRUCTURED_TOOL_ERROR_CODES];

export function structuredToolError(
  code: StructuredToolErrorCode,
  message: string,
  details: Record<string, unknown> = {}
) {
  return {
    schema: "creative.pipeline.structured_tool_error.v1",
    code,
    message,
    details
  };
}
