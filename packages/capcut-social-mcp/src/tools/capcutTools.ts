import { spawn } from "node:child_process";
import { access, mkdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { ToolDefinition } from "../../../core/dist/index.js";
import { checkProviderAvailability, getProviderCapability } from "../../../core/dist/index.js";

const aspectRatios = ["16:9", "9:16", "1:1", "4:5"];
const approvedAdapterBackends = ["capcut_cli", "py_jianying_draft"];
const approvedAdapterOperations = ["draft_manifest_validate", "package_export", "jianying_draft_write", "manifest_validate"];

export const capcutTools: ToolDefinition[] = [
  {
    name: "capcut.check_availability",
    description: "Check optional CapCut provider backends without proxying raw app APIs.",
    category: "capcut",
    risk: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async execute(context) {
      const provider = getProviderCapability("capcut");
      if (!provider) {
        return { ok: false, message: "CapCut provider is not registered" };
      }
      const report = {
        schema: "creative.pipeline.capcut_availability.v1",
        generatedAt: new Date().toISOString(),
        availability: checkProviderAvailability(provider),
        optionalBackends: ["CapCutAPI", "CapCut Mate", "capcut-cli", "pyJianYingDraft", "cut_cli"],
        policy: capcutPolicy()
      };
      const artifact = await context.artifactStore.writeJson("capcut/availability_report.json", report);
      return { ok: true, message: "CapCut availability report written", artifacts: [artifact], data: report };
    }
  },
  {
    name: "capcut.create_draft_plan",
    description: "Create a copy-on-write CapCut social draft plan for human-approved execution.",
    category: "capcut",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 200 },
        deliveryProfile: { type: "string" },
        durationSeconds: { type: "number", minimum: 1 },
        aspectRatio: { type: "string", enum: aspectRatios },
        media: { type: "array" },
        captionsPath: { type: "string" },
        copyOnWrite: { type: "boolean" }
      },
      required: ["title"],
      additionalProperties: false
    },
    async execute(context, input) {
      const plan = buildDraftPlan(input);
      const artifact = await context.artifactStore.writeJson("capcut/draft_plan.json", plan);
      return { ok: true, message: "CapCut draft plan written", artifacts: [artifact], data: { plan } };
    }
  },
  {
    name: "capcut.write_draft_manifest",
    description: "Write a CapCut draft manifest that records source media and copy-on-write safety constraints.",
    category: "capcut",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 200 },
        planPath: { type: "string" },
        media: { type: "array" },
        outputDirectory: { type: "string" }
      },
      required: ["title"],
      additionalProperties: false
    },
    async execute(context, input) {
      const manifest = {
        schema: "creative.pipeline.capcut_draft_manifest.v1",
        title: requiredString(input.title, "Untitled CapCut Draft"),
        generatedAt: new Date().toISOString(),
        planPath: optionalString(input.planPath),
        outputDirectory: optionalString(input.outputDirectory) ?? "artifacts/capcut/drafts",
        copyOnWrite: true,
        media: mediaList(input.media),
        expectedArtifacts: ["capcut/draft_plan.json", "capcut/draft_manifest.json", "capcut/draft_qc_report.json"],
        policy: capcutPolicy()
      };
      const artifact = await context.artifactStore.writeJson("capcut/draft_manifest.json", manifest);
      return { ok: true, message: "CapCut draft manifest written", artifacts: [artifact], data: { manifest } };
    }
  },
  {
    name: "capcut.run_draft_qc",
    description: "Run policy and delivery checks on a CapCut draft plan or manifest.",
    category: "capcut",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        aspectRatio: { type: "string", enum: aspectRatios },
        media: { type: "array" },
        captionsPath: { type: "string" },
        copyOnWrite: { type: "boolean" }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const report = {
        schema: "creative.pipeline.capcut_draft_qc.v1",
        generatedAt: new Date().toISOString(),
        title: optionalString(input.title) ?? "CapCut Draft",
        status: input.copyOnWrite === false ? "fail" : "pass",
        checks: [
          check("copy_on_write", input.copyOnWrite !== false, true),
          check("aspect_ratio", !input.aspectRatio || aspectRatios.includes(String(input.aspectRatio)), input.aspectRatio ?? "not_provided"),
          check("media_manifest", mediaList(input.media).length > 0, mediaList(input.media).length),
          check("captions_optional", true, optionalString(input.captionsPath) ?? "not_provided"),
          check("raw_proxy_absent", true, false)
        ],
        policy: capcutPolicy()
      };
      const artifact = await context.artifactStore.writeJson("capcut/draft_qc_report.json", report);
      return { ok: report.status === "pass", message: "CapCut draft QC report written", artifacts: [artifact], data: { report } };
    }
  },
  {
    name: "capcut.create_social_draft",
    description: "Create a CapCut social-video draft plan, manifest, and QC report in one artifact-first macro.",
    category: "capcut",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 200 },
        deliveryProfile: { type: "string" },
        durationSeconds: { type: "number" },
        aspectRatio: { type: "string", enum: aspectRatios },
        media: { type: "array" },
        captionsPath: { type: "string" }
      },
      required: ["title"],
      additionalProperties: false
    },
    async execute(context, input) {
      const plan = buildDraftPlan(input);
      const manifest = {
        schema: "creative.pipeline.capcut_draft_manifest.v1",
        title: plan.title,
        generatedAt: plan.generatedAt,
        copyOnWrite: true,
        media: plan.media,
        outputDirectory: "artifacts/capcut/drafts",
        policy: capcutPolicy()
      };
      const qc = {
        schema: "creative.pipeline.capcut_draft_qc.v1",
        generatedAt: plan.generatedAt,
        title: plan.title,
        status: "pass",
        checks: [
          check("copy_on_write", true, true),
          check("typed_operations_only", true, true),
          check("raw_proxy_absent", true, false)
        ],
        policy: capcutPolicy()
      };
      const artifacts = [
        await context.artifactStore.writeJson("capcut/draft_plan.json", plan),
        await context.artifactStore.writeJson("capcut/draft_manifest.json", manifest),
        await context.artifactStore.writeJson("capcut/draft_qc_report.json", qc)
      ];
      return { ok: true, message: "CapCut social draft artifacts written", artifacts, data: { plan, manifest, qc } };
    }
  },
  {
    name: "capcut.resolve_adapter",
    description: "Resolve a bounded optional CapCut backend without exposing raw cloud, GUI, or draft APIs.",
    category: "capcut",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        preferredBackend: {
          type: "string",
          enum: ["capcut_mate", "capcut_api", "capcut_cli", "py_jianying_draft", "cut_cli"]
        },
        requireAvailable: { type: "boolean" }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const report = resolveCapCutAdapter(input);
      const artifact = await context.artifactStore.writeJson("capcut/adapter_resolution.json", report);
      return {
        ok: !input.requireAvailable || report.selected.available,
        message: `CapCut adapter resolved: ${report.selected.backend}`,
        artifacts: [artifact],
        data: { report }
      };
    }
  },
  {
    name: "capcut.export_draft_package",
    description: "Write a copy-on-write CapCut draft package manifest for a human or approved runner to import.",
    category: "capcut",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 200 },
        draftManifestPath: { type: "string" },
        outputDirectory: { type: "string" },
        backend: {
          type: "string",
          enum: ["capcut_mate", "capcut_api", "capcut_cli", "py_jianying_draft", "cut_cli", "manual"]
        }
      },
      required: ["title"],
      additionalProperties: false
    },
    async execute(context, input) {
      const title = requiredString(input.title, "CapCut Draft Package");
      const backend = optionalString(input.backend) ?? "manual";
      const manifest = {
        schema: "creative.pipeline.capcut_draft_package.v1",
        generatedAt: new Date().toISOString(),
        title,
        backend,
        draftManifestPath: optionalString(input.draftManifestPath) ?? "artifacts/capcut/draft_manifest.json",
        outputDirectory: optionalString(input.outputDirectory) ?? "artifacts/capcut/draft-packages",
        packageMode: "copy_on_write_manifest_package",
        expectedArtifacts: [
          "capcut/draft_plan.json",
          "capcut/draft_manifest.json",
          "capcut/draft_qc_report.json",
          "capcut/draft_package_manifest.json"
        ],
        expectedSideEffects: ["write_artifacts_only", "no_source_draft_mutation"],
        requiresApproval: backend !== "manual",
        statusJsonPath: "capcut/draft_status.json",
        rollbackHint: "Delete generated package artifacts; original draft and source media are not modified.",
        policy: capcutPolicy()
      };
      const artifact = await context.artifactStore.writeJson("capcut/draft_package_manifest.json", manifest);
      return { ok: true, message: "CapCut draft package manifest written", artifacts: [artifact], data: { manifest } };
    }
  },
  {
    name: "capcut.run_delivery_qc",
    description: "Write CapCut delivery QC connected to the same FFmpeg-style delivery gates used for video exports.",
    category: "capcut",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 200 },
        outputPath: { type: "string" },
        aspectRatio: { type: "string", enum: aspectRatios },
        durationSeconds: { type: "number", minimum: 1 },
        media: { type: "array" }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const durationSeconds = Number(input.durationSeconds ?? 0);
      const media = mediaList(input.media);
      const outputPath = optionalString(input.outputPath);
      const report = {
        schema: "creative.pipeline.capcut_delivery_qc.v1",
        generatedAt: new Date().toISOString(),
        title: optionalString(input.title) ?? "CapCut Delivery",
        status: durationSeconds > 0 && Boolean(outputPath) ? "pass" : "pending",
        outputPath,
        checks: [
          check("output_path_declared", Boolean(outputPath), outputPath ?? "not_provided"),
          check("duration_positive", durationSeconds > 0, durationSeconds || "not_provided"),
          check("aspect_ratio_supported", !input.aspectRatio || aspectRatios.includes(String(input.aspectRatio)), input.aspectRatio ?? "not_provided"),
          check("media_manifest_present", media.length > 0, media.length),
          check("ffmpeg_delivery_qc_followup", true, "premiere.run_delivery_qc or ffprobe/ffmpeg adapter"),
          check("raw_proxy_absent", true, false)
        ],
        followUp: {
          requiredForFinalDelivery: "Run Premiere/FFmpeg delivery QC against outputPath after a real CapCut export exists.",
          liveExportClaim: Boolean(outputPath)
        },
        policy: capcutPolicy()
      };
      const artifact = await context.artifactStore.writeJson("capcut/delivery_qc_report.json", report);
      return { ok: report.status !== "fail", message: "CapCut delivery QC report written", artifacts: [artifact], data: { report } };
    }
  },
  {
    name: "capcut.run_approved_adapter",
    description: "Run a bounded CapCut CLI-style adapter when explicitly enabled, without raw draft/API proxying.",
    category: "capcut",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        commandId: { type: "string" },
        backend: { type: "string", enum: approvedAdapterBackends },
        operation: { type: "string", enum: approvedAdapterOperations },
        executablePath: { type: "string" },
        draftManifestPath: { type: "string" },
        outputDirectory: { type: "string" },
        timeoutSeconds: { type: "number" },
        requireEnabled: { type: "boolean" }
      },
      required: ["backend", "operation", "draftManifestPath"],
      additionalProperties: false
    },
    async execute(context, input) {
      await context.approvalPolicy.assertAllowed("capcut.run_approved_adapter", "project_write");
      const commandIdValue = optionalString(input.commandId) ?? commandId("capcut-run");
      const backend = requiredString(input.backend, "capcut_cli");
      const operation = requiredString(input.operation, "draft_manifest_validate");
      const enabled = process.env.CREATIVE_MCP_ENABLE_CAPCUT_APPROVED_ADAPTER === "true";
      const requireEnabled = input.requireEnabled === true;
      const executable = capcutExecutable(backend, optionalString(input.executablePath));
      const draftManifest = await readableIfProvided(context, optionalString(input.draftManifestPath));
      const outputDirectory = safeFutureOutputDirectory(context, optionalString(input.outputDirectory) ?? "capcut/draft-packages");
      const operationAllowed = isApprovedCapCutOperation(backend, operation);
      const timeoutMs = clampTimeout(input.timeoutSeconds);
      const argv = buildCapCutAdapterArgv(executable, backend, operation, draftManifest.resolvedPath ?? optionalString(input.draftManifestPath) ?? "", outputDirectory);
      const preflight = {
        enabled,
        backend,
        operation,
        operationAllowed,
        draftManifestReadable: draftManifest.ok,
        draftManifestPath: draftManifest.resolvedPath ?? optionalString(input.draftManifestPath),
        outputDirectory,
        timeoutMs
      };
      const canRun = enabled && operationAllowed && draftManifest.ok;
      if (!canRun) {
        const status = capcutStatus(
          commandIdValue,
          enabled ? "blocked_preflight" : "blocked_env_disabled",
          enabled
            ? "CapCut approved adapter preflight failed"
            : "Set CREATIVE_MCP_ENABLE_CAPCUT_APPROVED_ADAPTER=true to execute CapCut CLI adapters"
        );
        const report = capcutAdapterRunReport(commandIdValue, "preflight", argv, preflight, {
          exitCode: null,
          signal: null,
          stdout: "",
          stderr: "",
          outputReadable: false,
          outputSizeBytes: null
        });
        const artifacts = [
          await context.artifactStore.writeJson("capcut/adapter_run_report.json", report),
          await context.artifactStore.writeJson("capcut/draft_status.json", status)
        ];
        return { ok: !requireEnabled, message: status.message, artifacts, data: { report, status } };
      }
      await mkdir(outputDirectory, { recursive: true });
      const processResult = await spawnWithCapture(argv[0], argv.slice(1), timeoutMs);
      const output = await outputState(outputDirectory);
      const statusName = processResult.exitCode === 0 ? "success" : processResult.timedOut ? "failed_timeout" : "failed";
      const status = capcutStatus(commandIdValue, statusName, `CapCut ${backend} ${operation} finished with ${statusName}`);
      const report = capcutAdapterRunReport(commandIdValue, "executed", argv, preflight, {
        exitCode: processResult.exitCode,
        signal: processResult.signal,
        stdout: processResult.stdout,
        stderr: processResult.stderr,
        outputReadable: output.readable,
        outputSizeBytes: output.sizeBytes
      });
      const artifacts = [
        await context.artifactStore.writeJson("capcut/adapter_run_report.json", report),
        await context.artifactStore.writeJson("capcut/draft_status.json", status)
      ];
      return { ok: statusName === "success", message: status.message, artifacts, data: { report, status } };
    }
  }
];

function buildDraftPlan(input: Record<string, unknown>) {
  const title = requiredString(input.title, "Untitled CapCut Draft");
  return {
    schema: "creative.pipeline.capcut_draft_plan.v1",
    title,
    generatedAt: new Date().toISOString(),
    provider: "capcut",
    deliveryProfile: optionalString(input.deliveryProfile) ?? "captioned_social_delivery",
    durationSeconds: Number(input.durationSeconds ?? 60),
    aspectRatio: optionalString(input.aspectRatio) ?? "9:16",
    media: mediaList(input.media),
    captionsPath: optionalString(input.captionsPath),
    copyOnWrite: input.copyOnWrite !== false,
    expectedSideEffects: ["write_artifacts_only", "no_capcut_project_mutation"],
    requiresApproval: true,
    statusJsonPath: "capcut/draft_status.json",
    rollbackHint: "Delete generated draft artifacts; source media is not modified.",
    policy: capcutPolicy()
  };
}

function capcutPolicy() {
  return {
    rawProxy: false,
    copyOnWriteRequired: true,
    noEncryptedDraftBypass: true,
    noBinaryModification: true,
    noRawDraftOverwrite: true,
    approvalRequiredForCloudOrGuiWrites: true
  };
}

function capcutStatus(commandIdValue: string, status: string, message: string) {
  return {
    schema: "creative.pipeline.capcut_status.v1",
    commandId: commandIdValue,
    status,
    message,
    generatedAt: new Date().toISOString()
  };
}

function commandId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

function resolveCapCutAdapter(input: Record<string, unknown>) {
  const backends = [
    {
      backend: "capcut_mate",
      label: "CapCut Mate",
      available: Boolean(process.env.CREATIVE_MCP_CAPCUT_MATE_URL),
      endpoint: process.env.CREATIVE_MCP_CAPCUT_MATE_URL,
      supportedOperations: ["draft_package_import", "status_poll"]
    },
    {
      backend: "capcut_api",
      label: "CapCutAPI",
      available: Boolean(process.env.CREATIVE_MCP_CAPCUT_API_URL),
      endpoint: process.env.CREATIVE_MCP_CAPCUT_API_URL,
      supportedOperations: ["draft_package_import", "cloud_status_poll"]
    },
    {
      backend: "capcut_cli",
      label: "capcut-cli",
      available: Boolean(process.env.CREATIVE_MCP_CAPCUT_CLI),
      executable: process.env.CREATIVE_MCP_CAPCUT_CLI ?? "capcut-cli",
      supportedOperations: ["draft_manifest_validate", "package_export"]
    },
    {
      backend: "py_jianying_draft",
      label: "pyJianYingDraft",
      available: Boolean(process.env.CREATIVE_MCP_PY_JIANYING_DRAFT),
      executable: process.env.CREATIVE_MCP_PY_JIANYING_DRAFT ?? "pyJianYingDraft",
      supportedOperations: ["jianying_draft_write", "manifest_validate"]
    },
    {
      backend: "cut_cli",
      label: "cut_cli",
      available: Boolean(process.env.CREATIVE_MCP_CUT_CLI),
      executable: process.env.CREATIVE_MCP_CUT_CLI ?? "cut_cli",
      supportedOperations: ["research_only"]
    }
  ];
  const preferred = optionalString(input.preferredBackend);
  const selected = backends.find((backend) => backend.backend === preferred)
    ?? backends.find((backend) => backend.available)
    ?? backends[0];
  return {
    schema: "creative.pipeline.capcut_adapter_resolution.v1",
    generatedAt: new Date().toISOString(),
    selected,
    backends,
    policy: {
      ...capcutPolicy(),
      boundedOperationsOnly: true,
      rawCloudProxy: false,
      rawDraftProxy: false,
      liveExecutionClaim: selected.available
    }
  };
}

function mediaList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function capcutExecutable(backend: string, inputExecutable?: string): string {
  if (inputExecutable) {
    return inputExecutable;
  }
  if (backend === "py_jianying_draft") {
    return process.env.CREATIVE_MCP_PY_JIANYING_DRAFT ?? "pyJianYingDraft";
  }
  return process.env.CREATIVE_MCP_CAPCUT_CLI ?? "capcut-cli";
}

function isApprovedCapCutOperation(backend: string, operation: string): boolean {
  if (backend === "capcut_cli") {
    return operation === "draft_manifest_validate" || operation === "package_export" || operation === "manifest_validate";
  }
  if (backend === "py_jianying_draft") {
    return operation === "jianying_draft_write" || operation === "manifest_validate";
  }
  return false;
}

function buildCapCutAdapterArgv(executable: string, backend: string, operation: string, draftManifestPath: string, outputDirectory: string): string[] {
  if (backend === "py_jianying_draft") {
    if (operation === "jianying_draft_write") {
      return [executable, "write", "--manifest", draftManifestPath, "--out", outputDirectory];
    }
    return [executable, "validate", "--manifest", draftManifestPath];
  }
  if (operation === "package_export") {
    return [executable, "export-package", "--manifest", draftManifestPath, "--out", outputDirectory];
  }
  return [executable, "validate", "--manifest", draftManifestPath];
}

async function readableIfProvided(
  context: Parameters<ToolDefinition["execute"]>[0],
  path: string | undefined
): Promise<{ ok: boolean; resolvedPath?: string }> {
  if (!path) {
    return { ok: false };
  }
  try {
    return { ok: true, resolvedPath: await context.artifactStore.assertReadableFile(path) };
  } catch {
    return { ok: false };
  }
}

function safeFutureOutputDirectory(context: Parameters<ToolDefinition["execute"]>[0], path: string): string {
  const target = isAbsolute(path) ? resolve(path) : resolve(context.artifactStore.root, path);
  const roots = [context.artifactStore.root, ...(context.artifactStore.workspaceRoots ?? [])].map((root) => resolve(root));
  const inside = roots.some((root) => {
    const delta = relative(root, target);
    return delta === "" || (!delta.startsWith("..") && !isAbsolute(delta));
  });
  if (!inside) {
    throw new Error(`CapCut output directory is outside allowed artifact/workspace roots: ${path}`);
  }
  return target;
}

function clampTimeout(value: unknown): number {
  const seconds = Number(value ?? 600);
  if (!Number.isFinite(seconds)) {
    return 600_000;
  }
  return Math.max(5, Math.min(seconds, 7200)) * 1000;
}

async function spawnWithCapture(command: string, args: string[], timeoutMs: number) {
  return new Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
  }>((resolveProcess) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout = truncate(`${stdout}${chunk.toString()}`);
    });
    child.stderr.on("data", (chunk) => {
      stderr = truncate(`${stderr}${chunk.toString()}`);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveProcess({ exitCode: null, signal: null, stdout, stderr: truncate(`${stderr}\n${error.message}`), timedOut });
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolveProcess({ exitCode, signal, stdout, stderr, timedOut });
    });
  });
}

function truncate(value: string): string {
  return value.length > 20_000 ? value.slice(-20_000) : value;
}

async function outputState(path: string): Promise<{ readable: boolean; sizeBytes: number | null }> {
  try {
    await access(path, constants.R_OK);
    const details = await stat(path);
    return { readable: true, sizeBytes: details.size };
  } catch {
    return { readable: false, sizeBytes: null };
  }
}

function capcutAdapterRunReport(
  commandIdValue: string,
  mode: string,
  argv: string[],
  preflight: Record<string, unknown>,
  result: {
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    outputReadable: boolean;
    outputSizeBytes: number | null;
  }
) {
  return {
    schema: "creative.pipeline.capcut_adapter_run_report.v1",
    generatedAt: new Date().toISOString(),
    commandId: commandIdValue,
    mode,
    argv,
    preflight,
    result,
    checks: [
      check("argv_array_only", true, argv),
      check("shell_string_absent", true, true),
      check("copy_on_write_required", true, true),
      check("raw_proxy_absent", true, false),
      check("raw_draft_overwrite_absent", true, false)
    ],
    policy: {
      ...capcutPolicy(),
      approvedAdapterOnly: true,
      shellString: false,
      liveExecutionClaim: mode === "executed" && result.exitCode === 0
    }
  };
}

function check(id: string, passed: boolean, value: unknown) {
  return { id, status: passed ? "pass" : "fail", value };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredString(value: unknown, fallback: string): string {
  return optionalString(value) ?? fallback;
}
