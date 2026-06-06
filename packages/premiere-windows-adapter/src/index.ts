export interface WindowsCepBridgeConfig {
  host: string;
  port: number;
  cepExtensionId: string;
  trustedClientOnly: boolean;
}

export function defaultWindowsCepBridgeConfig(): WindowsCepBridgeConfig {
  return {
    host: "127.0.0.1",
    port: 48991,
    cepExtensionId: "creative.pipeline.mcp.premiere",
    trustedClientOnly: true
  };
}

export function createExtendScriptEnvelope(script: string): { script: string; blocked: boolean; reason?: string } {
  const blockedPatterns = [/System\.callSystem/iu, /\beval\s*\(/iu, /\bnew\s+Function\b/iu];
  const blocked = blockedPatterns.find((pattern) => pattern.test(script));
  if (blocked) {
    return { script: "", blocked: true, reason: `Blocked unsafe ExtendScript pattern: ${blocked.source}` };
  }
  return { script, blocked: false };
}

