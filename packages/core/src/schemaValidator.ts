import { Ajv, type ErrorObject } from "ajv/dist/ajv.js";
import type { ToolDefinition } from "./types.js";

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  coerceTypes: false,
  removeAdditional: false
});

export function validateToolInput(
  tool: ToolDefinition,
  input: Record<string, unknown>
): { ok: true; errors: [] } | { ok: false; errors: string[] } {
  const validate = ajv.compile(tool.inputSchema);
  if (validate(input)) {
    return { ok: true, errors: [] };
  }
  return {
    ok: false,
    errors: (validate.errors ?? []).map((error: ErrorObject) => {
      const path = error.instancePath || "/";
      return `${path} ${error.message ?? "is invalid"}`;
    })
  };
}
