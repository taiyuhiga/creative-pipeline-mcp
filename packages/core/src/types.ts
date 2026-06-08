export type ToolRisk = "read" | "safe_write" | "project_write" | "destructive" | "admin";

export type PermissionLevel =
  | "read_only"
  | "safe_write"
  | "project_write"
  | "destructive"
  | "admin";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface ToolResult {
  ok: boolean;
  message: string;
  artifacts?: string[];
  data?: unknown;
}

export interface JsonSchema {
  type: "object";
  properties?: Record<string, JsonValue>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolExecutionContext {
  artifactStore: ArtifactStoreLike;
  approvalPolicy: ApprovalPolicyLike;
  licenseManifest: LicenseManifestLike;
  logger: ToolLogger;
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: "core" | "asset" | "blender" | "premiere" | "gpl" | "dashboard";
  risk: ToolRisk;
  inputSchema: JsonSchema;
  execute(context: ToolExecutionContext, input: Record<string, unknown>): Promise<ToolResult>;
}

export interface ArtifactStoreLike {
  root: string;
  workspaceRoots?: string[];
  writeJson(relativePath: string, value: unknown): Promise<string>;
  writeText(relativePath: string, value: string): Promise<string>;
  writeBytes(relativePath: string, value: Uint8Array): Promise<string>;
  copyIn(sourcePath: string, relativePath: string): Promise<string>;
  assertReadableFile(sourcePath: string): Promise<string>;
}

export interface ApprovalPolicyLike {
  permissionLevel: PermissionLevel;
  assertAllowed(action: string, risk: ToolRisk): Promise<void>;
}

export interface LicenseManifestLike {
  add(entry: LicenseEntry): void;
  list(): LicenseEntry[];
}

export interface ToolLogger {
  log(event: string, detail: Record<string, unknown>): void;
}

export interface LicenseEntry {
  name: string;
  license: string;
  role: string;
  integration: "direct" | "optional_external" | "reference_only";
  url?: string;
}
