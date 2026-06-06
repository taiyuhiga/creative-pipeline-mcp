import type { PermissionLevel, ToolRisk } from "./types.js";

const riskRank: Record<ToolRisk, number> = {
  read: 0,
  safe_write: 1,
  project_write: 2,
  destructive: 3,
  admin: 4
};

const permissionRank: Record<PermissionLevel, number> = {
  read_only: 0,
  safe_write: 1,
  project_write: 2,
  destructive: 3,
  admin: 4
};

export class ApprovalPolicy {
  constructor(public readonly permissionLevel: PermissionLevel = "safe_write") {}

  async assertAllowed(action: string, risk: ToolRisk): Promise<void> {
    if (permissionRank[this.permissionLevel] < riskRank[risk]) {
      throw new Error(
        `Approval required for ${action}; risk=${risk}, current_permission=${this.permissionLevel}`
      );
    }
  }
}

export function permissionFromEnv(): PermissionLevel {
  const value = process.env.CREATIVE_MCP_PERMISSION as PermissionLevel | undefined;
  if (
    value === "read_only" ||
    value === "safe_write" ||
    value === "project_write" ||
    value === "destructive" ||
    value === "admin"
  ) {
    return value;
  }
  return "safe_write";
}

