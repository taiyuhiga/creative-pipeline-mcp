import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface PremiereCepCommand {
  id: string;
  type: "build_timeline_from_otio" | "export_sequence" | "apply_brand_package";
  payload: Record<string, unknown>;
  createdAt: string;
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

export async function listPremiereStatuses(): Promise<Array<{ id: string; path: string; status: unknown }>> {
  const statusDir = resolve(process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR ?? "artifacts/premiere/cep_status");
  let entries: string[];
  try {
    entries = await readdir(statusDir);
  } catch {
    return [];
  }
  const statuses = [];
  for (const entry of entries.filter((file) => file.endsWith(".json"))) {
    const path = join(statusDir, entry);
    try {
      statuses.push({ id: entry, path, status: JSON.parse(await readFile(path, "utf8")) });
    } catch {
      statuses.push({ id: entry, path, status: { unreadable: true } });
    }
  }
  return statuses;
}
