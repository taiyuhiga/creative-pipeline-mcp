import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export type PremiereCepCommandType =
  | "build_timeline_from_otio"
  | "export_sequence"
  | "apply_brand_package"
  | "apply_timeline_markers"
  | "trim_clip"
  | "split_clip"
  | "move_clip"
  | "add_marker"
  | "set_clip_speed";

export interface PremiereCepCommand {
  id: string;
  commandId: string;
  type: PremiereCepCommandType;
  payload: Record<string, unknown>;
  createdAt: string;
  idempotencyKey: string;
  expectedSideEffects: string[];
  requiresApproval: boolean;
  statusJsonPath: string;
  rollbackHint: string | null;
}

export interface PremiereCepStatus {
  schema: "creative.pipeline.premiere.status.v1";
  commandId?: string | null;
  commandType: PremiereCepCommandType | "unknown";
  status: "success" | "accepted" | "error" | string;
  message: string;
  details: Record<string, unknown>;
  command?: PremiereCepCommand;
  processedAt?: string;
  finishedAt?: string;
}

export async function enqueuePremiereCommand(
  type: PremiereCepCommandType,
  payload: Record<string, unknown>,
  options: {
    commandId?: string;
    idempotencyKey?: string;
    expectedSideEffects?: string[];
    requiresApproval?: boolean;
    rollbackHint?: string | null;
  } = {}
): Promise<{ command: PremiereCepCommand; path: string }> {
  const queueDir = resolve(process.env.CREATIVE_MCP_PREMIERE_IPC_DIR ?? "artifacts/premiere/cep_queue");
  const statusDir = resolve(process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR ?? "artifacts/premiere/cep_status");
  await mkdir(queueDir, { recursive: true });
  await mkdir(statusDir, { recursive: true });
  const commandId = options.commandId ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const command: PremiereCepCommand = {
    id: commandId,
    commandId,
    type,
    payload,
    createdAt: new Date().toISOString(),
    idempotencyKey: options.idempotencyKey ?? commandId,
    expectedSideEffects: options.expectedSideEffects ?? [],
    requiresApproval: options.requiresApproval ?? true,
    statusJsonPath: join(statusDir, `${commandId}.json`),
    rollbackHint: options.rollbackHint ?? null
  };
  const path = join(queueDir, `${commandId}.json`);
  await writeFile(path, `${JSON.stringify(command, null, 2)}\n`, "utf8");
  return { command, path };
}

export async function listPremiereStatuses(): Promise<Array<{ id: string; path: string; status: PremiereCepStatus }>> {
  const statusDir = resolve(process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR ?? "artifacts/premiere/cep_status");
  let entries: string[];
  try {
    entries = await readdir(statusDir);
  } catch {
    return [];
  }
  const statuses: Array<{ id: string; path: string; status: PremiereCepStatus }> = [];
  for (const entry of entries.filter((file) => file.endsWith(".json"))) {
    const path = join(statusDir, entry);
    try {
      statuses.push({ id: entry, path, status: normalizeStatus(JSON.parse(await readFile(path, "utf8"))) });
    } catch {
      statuses.push({
        id: entry,
        path,
        status: {
          schema: "creative.pipeline.premiere.status.v1",
          commandType: "unknown",
          status: "error",
          message: "unreadable status file",
          details: { unreadable: true }
        }
      });
    }
  }
  return statuses;
}

export async function findPremiereStatus(criteria: {
  commandId?: string;
  commandType?: PremiereCepCommandType;
}): Promise<{ id: string; path: string; status: PremiereCepStatus } | undefined> {
  const statuses = await listPremiereStatuses();
  return statuses.find((entry) => {
    const commandId = entry.status.commandId ?? entry.status.command?.commandId ?? entry.status.command?.id;
    return (!criteria.commandId || commandId === criteria.commandId)
      && (!criteria.commandType || entry.status.commandType === criteria.commandType);
  });
}

function normalizeStatus(value: unknown): PremiereCepStatus {
  if (isStatus(value)) {
    return value;
  }
  const legacy = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    schema: "creative.pipeline.premiere.status.v1",
    commandType: "unknown",
    status: typeof legacy.status === "string" ? legacy.status : "accepted",
    message: typeof legacy.message === "string" ? legacy.message : "legacy CEP status",
    details: legacy
  };
}

function isStatus(value: unknown): value is PremiereCepStatus {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return candidate.schema === "creative.pipeline.premiere.status.v1"
    && typeof candidate.commandType === "string"
    && typeof candidate.status === "string"
    && typeof candidate.message === "string"
    && typeof candidate.details === "object";
}
