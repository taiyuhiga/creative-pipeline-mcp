import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface PremiereCepCommand {
  id: string;
  type: "build_timeline_from_otio" | "export_sequence" | "apply_brand_package";
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PremiereCepStatus {
  schema: "creative.pipeline.premiere.status.v1";
  commandType: PremiereCepCommand["type"] | "unknown";
  status: "success" | "accepted" | "error" | string;
  message: string;
  details: Record<string, unknown>;
  command?: PremiereCepCommand;
  processedAt?: string;
}

export async function enqueuePremiereCommand(
  type: PremiereCepCommand["type"],
  payload: Record<string, unknown>
): Promise<{ command: PremiereCepCommand; path: string }> {
  const queueDir = resolve(process.env.CREATIVE_MCP_PREMIERE_IPC_DIR ?? "artifacts/premiere/cep_queue");
  await mkdir(queueDir, { recursive: true });
  const command: PremiereCepCommand = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    payload,
    createdAt: new Date().toISOString()
  };
  const path = join(queueDir, `${command.id}.json`);
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
