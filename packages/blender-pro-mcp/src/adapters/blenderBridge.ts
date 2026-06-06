import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface BlenderBridgeCommand {
  id: string;
  type: "create_scene" | "create_asset" | "modify_asset" | "apply_material" | "run_safe_script";
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface BlenderBridgeStatus {
  schema: "creative.pipeline.blender.status.v1";
  commandId?: string | null;
  commandType: BlenderBridgeCommand["type"] | "unknown";
  status: "success" | "accepted" | "error" | string;
  message: string;
  details: Record<string, unknown>;
  command?: BlenderBridgeCommand;
  processedAt?: string;
  finishedAt?: string;
}

export async function enqueueBlenderBridgeCommand(
  type: BlenderBridgeCommand["type"],
  payload: Record<string, unknown>
): Promise<{ command: BlenderBridgeCommand; path: string }> {
  const queueDir = resolve(process.env.CREATIVE_MCP_BLENDER_IPC_DIR ?? "artifacts/blender/bridge_queue");
  await mkdir(queueDir, { recursive: true });
  const command: BlenderBridgeCommand = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    payload,
    createdAt: new Date().toISOString()
  };
  const path = join(queueDir, `${command.id}.json`);
  await writeFile(path, `${JSON.stringify(command, null, 2)}\n`, "utf8");
  return { command, path };
}

export async function listBlenderBridgeStatuses(): Promise<Array<{ id: string; path: string; status: BlenderBridgeStatus }>> {
  const statusDir = resolve(process.env.CREATIVE_MCP_BLENDER_STATUS_DIR ?? "artifacts/blender/bridge_status");
  let entries: string[];
  try {
    entries = await readdir(statusDir);
  } catch {
    return [];
  }
  const statuses: Array<{ id: string; path: string; status: BlenderBridgeStatus }> = [];
  for (const entry of entries.filter((file) => file.endsWith(".json"))) {
    const path = join(statusDir, entry);
    try {
      statuses.push({ id: entry, path, status: normalizeStatus(JSON.parse(await readFile(path, "utf8"))) });
    } catch {
      statuses.push({
        id: entry,
        path,
        status: {
          schema: "creative.pipeline.blender.status.v1",
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

export async function findBlenderBridgeStatus(criteria: {
  commandId?: string;
  commandType?: BlenderBridgeCommand["type"];
}): Promise<{ id: string; path: string; status: BlenderBridgeStatus } | undefined> {
  const statuses = await listBlenderBridgeStatuses();
  return statuses.find((entry) => {
    const commandId = entry.status.commandId ?? entry.status.command?.id;
    return (!criteria.commandId || commandId === criteria.commandId)
      && (!criteria.commandType || entry.status.commandType === criteria.commandType);
  });
}

function normalizeStatus(value: unknown): BlenderBridgeStatus {
  if (isStatus(value)) {
    return value;
  }
  const legacy = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    schema: "creative.pipeline.blender.status.v1",
    commandType: "unknown",
    status: typeof legacy.status === "string" ? legacy.status : "accepted",
    message: typeof legacy.message === "string" ? legacy.message : "legacy Blender bridge status",
    details: legacy
  };
}

function isStatus(value: unknown): value is BlenderBridgeStatus {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return candidate.schema === "creative.pipeline.blender.status.v1"
    && typeof candidate.commandType === "string"
    && typeof candidate.status === "string"
    && typeof candidate.message === "string"
    && typeof candidate.details === "object";
}
