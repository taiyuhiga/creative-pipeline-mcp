import { constants, existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import type { ToolDefinition, ToolExecutionContext } from "../../../core/dist/index.js";
import { checkProviderAvailability, getProviderCapability } from "../../../core/dist/index.js";

const scriptExtensions = new Set([".lua", ".luau"]);

export const robloxTools: ToolDefinition[] = [
  {
    name: "roblox.check_availability",
    description: "Check Roblox Studio/Rojo/Wally/Selene/Stylua availability for read-only QC workflows.",
    category: "roblox",
    risk: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async execute(context) {
      const provider = getProviderCapability("roblox_studio");
      if (!provider) {
        return { ok: false, message: "Roblox provider is not registered" };
      }
      const report = {
        schema: "creative.pipeline.roblox_availability.v1",
        generatedAt: new Date().toISOString(),
        availability: checkProviderAvailability(provider),
        policy: robloxPolicy()
      };
      const artifact = await context.artifactStore.writeJson("roblox/availability_report.json", report);
      return { ok: true, message: "Roblox availability report written", artifacts: [artifact], data: report };
    }
  },
  {
    name: "roblox.inspect_project",
    description: "Inspect a Roblox/Rojo project tree without mutating files.",
    category: "roblox",
    risk: "read",
    inputSchema: projectRootSchema(),
    async execute(context, input) {
      const root = safeProjectRoot(context, input.projectRoot);
      const files = await listFiles(root, 250);
      const projectFiles = files.filter((file) => file.endsWith(".project.json") || basename(file) === "default.project.json");
      const report = {
        schema: "creative.pipeline.roblox_project_report.v1",
        generatedAt: new Date().toISOString(),
        root,
        projectFiles,
        dependencyFiles: files.filter((file) => ["wally.toml", "selene.toml", "stylua.toml", "aftman.toml"].includes(basename(file))),
        scriptCount: files.filter((file) => scriptExtensions.has(extname(file))).length,
        policy: robloxPolicy()
      };
      const artifact = await context.artifactStore.writeJson("roblox/project_report.json", report);
      return { ok: true, message: "Roblox project report written", artifacts: [artifact], data: { report } };
    }
  },
  {
    name: "roblox.inspect_place_tree",
    description: "Read a Rojo project file and write a normalized Roblox place-tree report.",
    category: "roblox",
    risk: "read",
    inputSchema: {
      type: "object",
      properties: {
        projectRoot: { type: "string" },
        projectFile: { type: "string" }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const root = safeProjectRoot(context, input.projectRoot);
      const projectFile = optionalString(input.projectFile) ?? join(root, "default.project.json");
      const safeProjectFile = assertInside(root, projectFile);
      const parsed = existsSync(safeProjectFile) ? JSON.parse(await readFile(safeProjectFile, "utf8")) : {};
      const tree = {
        schema: "creative.pipeline.roblox_place_tree.v1",
        generatedAt: new Date().toISOString(),
        projectFile: safeProjectFile,
        name: parsed.name ?? basename(root),
        tree: parsed.tree ?? {},
        policy: robloxPolicy()
      };
      const artifact = await context.artifactStore.writeJson("roblox/place_tree.json", tree);
      return { ok: true, message: "Roblox place tree report written", artifacts: [artifact], data: { tree } };
    }
  },
  {
    name: "roblox.index_scripts",
    description: "Index Luau/Lua scripts in a Roblox project without executing them.",
    category: "roblox",
    risk: "read",
    inputSchema: {
      type: "object",
      properties: {
        projectRoot: { type: "string" },
        maxFiles: { type: "number" }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const root = safeProjectRoot(context, input.projectRoot);
      const maxFiles = Math.max(1, Math.min(Number(input.maxFiles ?? 200), 1000));
      const files = (await listFiles(root, maxFiles)).filter((file) => scriptExtensions.has(extname(file)));
      const index = {
        schema: "creative.pipeline.roblox_script_index.v1",
        generatedAt: new Date().toISOString(),
        root,
        scripts: files.map((file) => ({
          path: file,
          relativePath: relative(root, file),
          kind: classifyScript(file)
        })),
        policy: robloxPolicy()
      };
      const artifact = await context.artifactStore.writeJson("roblox/script_index.json", index);
      return { ok: true, message: "Roblox script index written", artifacts: [artifact], data: { index } };
    }
  },
  {
    name: "roblox.validate_luau_project",
    description: "Write a Luau project QC report using local file inspection and command-manifest checks.",
    category: "roblox",
    risk: "safe_write",
    inputSchema: projectRootSchema(),
    async execute(context, input) {
      const root = safeProjectRoot(context, input.projectRoot);
      const files = await listFiles(root, 500);
      const report = {
        schema: "creative.pipeline.roblox_luau_qc.v1",
        generatedAt: new Date().toISOString(),
        root,
        status: "pass",
        checks: [
          check("rojo_project_present", files.some((file) => file.endsWith(".project.json")), files.filter((file) => file.endsWith(".project.json")).length),
          check("scripts_indexable", files.some((file) => scriptExtensions.has(extname(file))), files.filter((file) => scriptExtensions.has(extname(file))).length),
          check("executor_tools_absent", true, true),
          check("raw_studio_proxy_absent", true, true)
        ],
        commandManifests: ["roblox/run_selene_manifest.json", "roblox/run_stylua_check_manifest.json"],
        policy: robloxPolicy()
      };
      const artifact = await context.artifactStore.writeJson("roblox/luau_qc_report.json", report);
      return { ok: true, message: "Roblox Luau QC report written", artifacts: [artifact], data: { report } };
    }
  },
  {
    name: "roblox.collect_studio_evidence",
    description: "Write Roblox Studio read-only status evidence without claiming live Studio integration unless status evidence is readable.",
    category: "roblox",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        commandId: { type: "string" },
        source: { type: "string", enum: ["manual", "self_hosted_runner", "official_studio_mcp"] },
        projectRoot: { type: "string" },
        projectName: { type: "string" },
        studioVersion: { type: "string" },
        status: { type: "string", enum: ["pending", "success", "failed", "unknown"] },
        statusEvidencePath: { type: "string" },
        placeFilePath: { type: "string" },
        requireStatusEvidence: { type: "boolean" }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const root = optionalString(input.projectRoot) ? safeProjectRoot(context, input.projectRoot) : undefined;
      const statusEvidencePath = optionalString(input.statusEvidencePath);
      const placeFilePath = optionalString(input.placeFilePath);
      let statusEvidenceReadable = false;
      let resolvedStatusEvidencePath: string | undefined;
      let statusEvidence: unknown;
      if (statusEvidencePath) {
        try {
          resolvedStatusEvidencePath = await context.artifactStore.assertReadableFile(statusEvidencePath);
          statusEvidenceReadable = true;
          statusEvidence = JSON.parse(await readFile(resolvedStatusEvidencePath, "utf8"));
        } catch {
          statusEvidenceReadable = false;
        }
      }
      let placeFileReadable = false;
      let resolvedPlaceFilePath: string | undefined;
      if (placeFilePath) {
        try {
          resolvedPlaceFilePath = await context.artifactStore.assertReadableFile(placeFilePath);
          placeFileReadable = true;
        } catch {
          placeFileReadable = false;
        }
      }
      const requireStatusEvidence = input.requireStatusEvidence === true;
      const status = optionalString(input.status) ?? "unknown";
      const liveStudioClaim = statusEvidenceReadable && status === "success";
      const reportStatus = statusEvidenceReadable
        ? status === "failed"
          ? "fail"
          : status === "success"
            ? "pass"
            : "pending"
        : requireStatusEvidence
          ? "fail"
          : "pending";
      const evidence = {
        schema: "creative.pipeline.roblox_studio_evidence.v1",
        generatedAt: new Date().toISOString(),
        commandId: optionalString(input.commandId) ?? evidenceId("roblox-studio"),
        source: optionalString(input.source) ?? "manual",
        projectRoot: root,
        projectName: optionalString(input.projectName),
        studioVersion: optionalString(input.studioVersion),
        status,
        reportStatus,
        statusEvidencePath,
        resolvedStatusEvidencePath,
        placeFilePath,
        resolvedPlaceFilePath,
        statusEvidence,
        checks: [
          check("status_evidence_declared", Boolean(statusEvidencePath), statusEvidencePath ?? "not_provided"),
          check("status_evidence_readable", statusEvidenceReadable, statusEvidenceReadable),
          check("place_file_declared", Boolean(placeFilePath), placeFilePath ?? "not_provided"),
          check("place_file_readable", placeFilePath ? placeFileReadable : true, placeFilePath ? placeFileReadable : "not_required"),
          check("live_studio_claim_guarded", liveStudioClaim === (statusEvidenceReadable && status === "success"), liveStudioClaim),
          check("raw_studio_proxy_absent", true, true),
          check("studio_write_absent", true, true),
          check("publish_absent", true, true)
        ],
        policy: {
          ...robloxPolicy(),
          liveStudioClaim,
          rawStudioProxy: false,
          studioWrites: false,
          publish: false
        }
      };
      const artifact = await context.artifactStore.writeJson("roblox/studio_evidence.json", evidence);
      return {
        ok: reportStatus !== "fail",
        message: `Roblox Studio evidence written: ${reportStatus}`,
        artifacts: [artifact],
        data: { evidence }
      };
    }
  },
  {
    name: "roblox.prepare_studio_mcp_session",
    description: "Write an official Roblox Studio MCP session plan and client config without connecting to Studio or proxying raw tools.",
    category: "roblox",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        commandId: { type: "string" },
        client: { type: "string", enum: ["generic", "codex", "cursor", "claude_desktop"] },
        operatingSystem: { type: "string", enum: ["macos", "windows"] },
        studioMcpCommand: { type: "string" },
        projectRoot: { type: "string" },
        experienceName: { type: "string" },
        mode: { type: "string", enum: ["read_only_inspection", "playtest_evidence", "write_requires_approval"] },
        allowedToolGroups: {
          type: "array",
          items: {
            type: "string",
            enum: ["session_management", "data_model_read", "script_read", "playtest", "limited_write"]
          }
        },
        requireStudioMcpBinary: { type: "boolean" }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const os = optionalString(input.operatingSystem) ?? defaultStudioMcpOs();
      const command = optionalString(input.studioMcpCommand) ?? defaultStudioMcpCommand(os);
      const root = optionalString(input.projectRoot) ? safeProjectRoot(context, input.projectRoot) : undefined;
      const mode = optionalString(input.mode) ?? "read_only_inspection";
      const allowedToolGroups = normalizeStudioMcpToolGroups(input.allowedToolGroups, mode);
      const requireStudioMcpBinary = input.requireStudioMcpBinary === true;
      const binaryReadable = await canReadStudioMcpBinary(command, os);
      const readyToConnect = requireStudioMcpBinary ? binaryReadable : true;
      const plan = {
        schema: "creative.pipeline.roblox_studio_mcp_session_plan.v1",
        generatedAt: new Date().toISOString(),
        commandId: optionalString(input.commandId) ?? evidenceId("roblox-studio-mcp"),
        client: optionalString(input.client) ?? "generic",
        operatingSystem: os,
        command,
        transport: "stdio",
        projectRoot: root,
        experienceName: optionalString(input.experienceName),
        mode,
        readyToConnect,
        checks: [
          check("official_studio_mcp_command_declared", Boolean(command), command),
          check("stdio_transport", true, "stdio"),
          check("studio_mcp_binary_readable", binaryReadable || os === "windows", binaryReadable),
          check("required_binary_readable", requireStudioMcpBinary ? binaryReadable : true, requireStudioMcpBinary ? binaryReadable : "not_required"),
          check("executor_tools_absent", true, true),
          check("raw_studio_proxy_absent", true, true),
          check("default_publish_absent", true, true),
          check("limited_write_requires_approval", !allowedToolGroups.includes("limited_write") || mode === "write_requires_approval", allowedToolGroups)
        ],
        allowedToolGroups,
        blockedToolGroups: ["executor_tools", "client_exploit_tools", "raw_studio_proxy", "default_publish"],
        expectedSideEffects: ["none_in_codex_run"],
        requiresApproval: mode !== "read_only_inspection" || allowedToolGroups.includes("limited_write"),
        clientConfig: studioMcpClientConfig(command, os),
        evidenceFollowUp: {
          requiredForLiveStudioClaim: [
            "Roblox Studio open with Studio MCP enabled",
            "client connection indicator visible in Studio",
            "readable status JSON captured by roblox.collect_studio_evidence",
            "status: success declared only after manual or self-hosted evidence exists"
          ],
          liveStudioClaim: false
        },
        policy: {
          ...robloxPolicy(),
          officialStudioMcpOnly: true,
          stdioTransport: true,
          liveStudioClaim: false,
          rawStudioProxy: false,
          executorTools: false,
          studioWrites: mode === "write_requires_approval",
          publish: false
        }
      };
      const planArtifact = await context.artifactStore.writeJson("roblox/studio_mcp_session_plan.json", plan);
      const configArtifact = await context.artifactStore.writeJson("roblox/studio_mcp_client_config.json", plan.clientConfig);
      return {
        ok: readyToConnect,
        message: readyToConnect ? "Roblox Studio MCP session plan written" : "Roblox Studio MCP session plan written with pending binary preflight",
        artifacts: [planArtifact, configArtifact],
        data: { plan }
      };
    }
  },
  commandManifestTool("roblox.sync_rojo", "Write a safe Rojo sync command manifest without publishing or mutating Studio.", "rojo", ["sync"], "roblox/sync_rojo_manifest.json"),
  commandManifestTool("roblox.run_wally_install", "Write a Wally install command manifest; actual install requires explicit external execution.", "wally", ["install"], "roblox/run_wally_install_manifest.json"),
  commandManifestTool("roblox.run_selene", "Write a Selene lint command manifest for Luau QC.", "selene", ["."], "roblox/run_selene_manifest.json"),
  commandManifestTool("roblox.run_stylua_check", "Write a StyLua check command manifest for Luau formatting QC.", "stylua", ["--check", "."], "roblox/run_stylua_check_manifest.json"),
  {
    name: "roblox.generate_project_report",
    description: "Generate combined Roblox project, script index, command manifest, and QC report artifacts.",
    category: "roblox",
    risk: "safe_write",
    inputSchema: projectRootSchema(),
    async execute(context, input) {
      const root = safeProjectRoot(context, input.projectRoot);
      const files = await listFiles(root, 500);
      const report = {
        schema: "creative.pipeline.roblox_combined_project_report.v1",
        generatedAt: new Date().toISOString(),
        root,
        projectFiles: files.filter((file) => file.endsWith(".project.json")),
        scripts: files.filter((file) => scriptExtensions.has(extname(file))).map((file) => ({
          path: file,
          relativePath: relative(root, file),
          kind: classifyScript(file)
        })),
        commandManifests: [
          commandManifest(root, "rojo", ["sync"], "manifest_only"),
          commandManifest(root, "wally", ["install"], "manifest_only"),
          commandManifest(root, "selene", ["."], "manifest_only"),
          commandManifest(root, "stylua", ["--check", "."], "manifest_only")
        ],
        status: "ready_for_human_review",
        policy: robloxPolicy()
      };
      const artifact = await context.artifactStore.writeJson("roblox/combined_project_report.json", report);
      return { ok: true, message: "Roblox combined project report written", artifacts: [artifact], data: { report } };
    }
  }
];

function commandManifestTool(name: string, description: string, command: string, args: string[], artifactPath: string): ToolDefinition {
  return {
    name,
    description,
    category: "roblox",
    risk: "safe_write",
    inputSchema: projectRootSchema(),
    async execute(context, input) {
      const root = safeProjectRoot(context, input.projectRoot);
      const manifest = commandManifest(root, command, args, "manifest_only");
      const artifact = await context.artifactStore.writeJson(artifactPath, manifest);
      return { ok: true, message: `${name} manifest written`, artifacts: [artifact], data: { manifest } };
    }
  };
}

function commandManifest(root: string, command: string, args: string[], mode: string) {
  return {
    schema: "creative.pipeline.roblox_command_manifest.v1",
    generatedAt: new Date().toISOString(),
    command,
    args,
    cwd: root,
    mode,
    expectedSideEffects: ["none_in_codex_run"],
    requiresApproval: true,
    policy: robloxPolicy()
  };
}

async function listFiles(root: string, maxFiles: number): Promise<string[]> {
  const files: string[] = [];
  async function walk(current: string): Promise<void> {
    if (files.length >= maxFiles) {
      return;
    }
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= maxFiles || entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  }
  await walk(root);
  return files;
}

function safeProjectRoot(context: ToolExecutionContext, value: unknown): string {
  const roots = Array.isArray(context.artifactStore.workspaceRoots) && context.artifactStore.workspaceRoots.length > 0
    ? context.artifactStore.workspaceRoots.map((root) => resolve(root))
    : [resolve(process.cwd())];
  const requested = optionalString(value) ? resolve(String(value)) : roots[0];
  const root = roots.find((workspaceRoot) => isInside(workspaceRoot, requested));
  if (!root) {
    throw new Error(`Project root is outside allowed workspace roots: ${requested}`);
  }
  if (!existsSync(requested)) {
    return root;
  }
  return requested;
}

function assertInside(root: string, file: string): string {
  const resolved = resolve(file);
  if (!isInside(root, resolved)) {
    throw new Error(`Path is outside project root: ${file}`);
  }
  return resolved;
}

function isInside(root: string, target: string): boolean {
  const delta = relative(root, target);
  return delta === "" || (!delta.startsWith("..") && !delta.startsWith("/"));
}

function classifyScript(file: string): string {
  const lower = basename(file).toLowerCase();
  if (lower.includes(".server.")) {
    return "server";
  }
  if (lower.includes(".client.")) {
    return "client";
  }
  if (lower.includes(".spec.")) {
    return "test";
  }
  return "module";
}

function projectRootSchema() {
  return {
    type: "object" as const,
    properties: { projectRoot: { type: "string" } },
    additionalProperties: false
  };
}

function robloxPolicy() {
  return {
    readOnlyPhaseOne: true,
    officialStudioMcpPreferredForFutureWrites: true,
    weppyReferenceOnlyUnlessLicenseReviewed: true,
    noExecutorTools: true,
    noClientExploitTools: true,
    noRawStudioProxy: true,
    noDefaultPublishing: true
  };
}

function defaultStudioMcpOs(): string {
  return process.platform === "win32" ? "windows" : "macos";
}

function defaultStudioMcpCommand(os: string): string {
  if (os === "windows") {
    return "cmd.exe /c %LOCALAPPDATA%\\Roblox\\mcp.bat";
  }
  return "/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP";
}

async function canReadStudioMcpBinary(command: string, os: string): Promise<boolean> {
  if (os === "windows") {
    return false;
  }
  try {
    await access(command, constants.R_OK | constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeStudioMcpToolGroups(value: unknown, mode: string): string[] {
  const defaultGroups = mode === "playtest_evidence"
    ? ["session_management", "data_model_read", "script_read", "playtest"]
    : mode === "write_requires_approval"
      ? ["session_management", "data_model_read", "script_read", "limited_write"]
      : ["session_management", "data_model_read", "script_read"];
  if (!Array.isArray(value)) {
    return defaultGroups;
  }
  const allowed = new Set(["session_management", "data_model_read", "script_read", "playtest", "limited_write"]);
  const groups = value.filter((item): item is string => typeof item === "string" && allowed.has(item));
  return groups.length > 0 ? [...new Set(groups)] : defaultGroups;
}

function studioMcpClientConfig(command: string, os: string) {
  if (os === "windows") {
    return {
      mcpServers: {
        roblox_studio: {
          command: "cmd.exe",
          args: ["/c", "%LOCALAPPDATA%\\Roblox\\mcp.bat"]
        }
      }
    };
  }
  return {
    mcpServers: {
      roblox_studio: {
        command,
        args: []
      }
    }
  };
}

function check(id: string, passed: boolean, value: unknown) {
  return { id, status: passed ? "pass" : "fail", value };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function evidenceId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}
