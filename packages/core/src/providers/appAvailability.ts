import { existsSync } from "node:fs";
import { delimiter } from "node:path";
import type { ProviderCapabilitySpec } from "./providerCapabilities.js";

export interface ProviderAvailability {
  provider: string;
  label: string;
  domain: string;
  stability: string;
  available: boolean;
  commands: Array<{ name: string; available: boolean; path?: string }>;
  env: Array<{ name: string; present: boolean }>;
  safeOperations: string[];
  blockedOperations: string[];
  risks: string[];
  notes: string[];
}

export function checkProviderAvailability(provider: ProviderCapabilitySpec): ProviderAvailability {
  const commands = (provider.commands ?? []).map((command) => {
    const foundPath = findCommand(command);
    return { name: command, available: Boolean(foundPath), path: foundPath };
  });
  const env = (provider.env ?? []).map((name) => ({ name, present: Boolean(process.env[name]) }));
  const hasCommand = commands.some((command) => command.available);
  const hasEnv = env.some((entry) => entry.present);
  return {
    provider: provider.id,
    label: provider.label,
    domain: provider.domain,
    stability: provider.stability,
    available: hasCommand || hasEnv,
    commands,
    env,
    safeOperations: provider.safeOperations,
    blockedOperations: provider.blockedOperations,
    risks: provider.risks,
    notes: provider.notes
  };
}

export function findCommand(command: string): string | undefined {
  const fromEnv = process.env[command.toUpperCase().replace(/[^A-Z0-9]+/g, "_") + "_BIN"];
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }
  if (command.includes("/") && existsSync(command)) {
    return command;
  }
  const pathValue = process.env.PATH ?? "";
  for (const entry of pathValue.split(delimiter)) {
    const candidate = `${entry}/${command}`;
    if (entry && existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}
