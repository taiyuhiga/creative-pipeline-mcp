export const JSON_RPC_ERRORS = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  toolExecutionError: -32000
} as const;

export type JsonRpcErrorCode = typeof JSON_RPC_ERRORS[keyof typeof JSON_RPC_ERRORS];

