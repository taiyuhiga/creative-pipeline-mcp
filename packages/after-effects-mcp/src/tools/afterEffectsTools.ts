import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { ToolDefinition } from "../../../core/dist/index.js";
import { checkProviderAvailability, getProviderCapability } from "../../../core/dist/index.js";

const formats = ["mov", "mp4", "png_sequence", "exr_sequence"];

export const afterEffectsTools: ToolDefinition[] = [
  {
    name: "ae.check_availability",
    description: "Check After Effects render-provider availability for aerender and nexrender.",
    category: "ae",
    risk: "read",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async execute(context) {
      const provider = getProviderCapability("after_effects");
      if (!provider) {
        return { ok: false, message: "After Effects provider is not registered" };
      }
      const report = {
        schema: "creative.pipeline.ae_availability.v1",
        generatedAt: new Date().toISOString(),
        availability: checkProviderAvailability(provider),
        policy: aePolicy()
      };
      const artifact = await context.artifactStore.writeJson("after-effects/availability_report.json", report);
      return { ok: true, message: "After Effects availability report written", artifacts: [artifact], data: report };
    }
  },
  {
    name: "ae.create_render_plan",
    description: "Create an artifact-first After Effects render plan without enabling raw JSX by default.",
    category: "ae",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string" },
        templatePath: { type: "string" },
        compName: { type: "string" },
        outputFormat: { type: "string", enum: formats },
        width: { type: "number" },
        height: { type: "number" },
        fps: { type: "number" },
        frame: { type: "number" },
        durationSeconds: { type: "number" }
      },
      required: ["compName"],
      additionalProperties: false
    },
    async execute(context, input) {
      const plan = buildRenderPlan(input);
      const artifact = await context.artifactStore.writeJson("after-effects/render_plan.json", plan);
      return { ok: true, message: "After Effects render plan written", artifacts: [artifact], data: { plan } };
    }
  },
  {
    name: "ae.queue_aerender",
    description: "Queue an aerender command manifest for approval-controlled render execution.",
    category: "ae",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string" },
        compName: { type: "string" },
        outputPath: { type: "string" },
        renderSettings: { type: "string" },
        outputModule: { type: "string" }
      },
      required: ["compName"],
      additionalProperties: false
    },
    async execute(context, input) {
      await context.approvalPolicy.assertAllowed("ae.queue_aerender", "project_write");
      const manifest = {
        schema: "creative.pipeline.ae_aerender_queue.v1",
        commandId: commandId("aerender"),
        generatedAt: new Date().toISOString(),
        engine: "aerender",
        projectPath: optionalString(input.projectPath),
        compName: requiredString(input.compName, "Main"),
        outputPath: optionalString(input.outputPath) ?? "artifacts/after-effects/output.mov",
        renderSettings: optionalString(input.renderSettings) ?? "Best Settings",
        outputModule: optionalString(input.outputModule) ?? "High Quality",
        expectedSideEffects: ["render_output_only"],
        requiresApproval: true,
        rawJsx: false,
        policy: aePolicy()
      };
      const status = renderStatus(manifest.commandId, "queued_manifest_only", "aerender manifest written");
      const artifacts = [
        await context.artifactStore.writeJson("after-effects/render_queue/aerender_command.json", manifest),
        await context.artifactStore.writeJson("after-effects/render_status.json", status)
      ];
      return { ok: true, message: "aerender queue manifest written", artifacts, data: { manifest, status } };
    }
  },
  {
    name: "ae.queue_nexrender",
    description: "Queue a nexrender job manifest for approval-controlled template rendering.",
    category: "ae",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        templatePath: { type: "string" },
        compName: { type: "string" },
        outputPath: { type: "string" },
        assets: { type: "array" }
      },
      required: ["templatePath"],
      additionalProperties: false
    },
    async execute(context, input) {
      await context.approvalPolicy.assertAllowed("ae.queue_nexrender", "project_write");
      const job = {
        schema: "creative.pipeline.ae_nexrender_job.v1",
        commandId: commandId("nexrender"),
        generatedAt: new Date().toISOString(),
        engine: "nexrender",
        templatePath: requiredString(input.templatePath, "template.aep"),
        compName: optionalString(input.compName) ?? "Main",
        outputPath: optionalString(input.outputPath) ?? "artifacts/after-effects/output.mov",
        assets: Array.isArray(input.assets) ? input.assets : [],
        expectedSideEffects: ["render_output_only"],
        requiresApproval: true,
        rawJsx: false,
        policy: aePolicy()
      };
      const status = renderStatus(job.commandId, "queued_manifest_only", "nexrender job manifest written");
      const artifacts = [
        await context.artifactStore.writeJson("after-effects/render_queue/nexrender_job.json", job),
        await context.artifactStore.writeJson("after-effects/render_status.json", status)
      ];
      return { ok: true, message: "nexrender job manifest written", artifacts, data: { job, status } };
    }
  },
  {
    name: "ae.render_frame_preview",
    description: "Write a frame preview render plan for a single After Effects frame.",
    category: "ae",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        projectPath: { type: "string" },
        compName: { type: "string" },
        frame: { type: "number" },
        outputPath: { type: "string" }
      },
      required: ["compName"],
      additionalProperties: false
    },
    async execute(context, input) {
      const plan = {
        schema: "creative.pipeline.ae_frame_preview_plan.v1",
        generatedAt: new Date().toISOString(),
        projectPath: optionalString(input.projectPath),
        compName: requiredString(input.compName, "Main"),
        frame: Number(input.frame ?? 0),
        outputPath: optionalString(input.outputPath) ?? "artifacts/after-effects/preview_frame.png",
        expectedArtifacts: ["after-effects/preview_frame.png", "after-effects/render_status.json"],
        rawJsx: false,
        policy: aePolicy()
      };
      const artifact = await context.artifactStore.writeJson("after-effects/frame_preview_plan.json", plan);
      return { ok: true, message: "After Effects frame preview plan written", artifacts: [artifact], data: { plan } };
    }
  },
  {
    name: "ae.run_motion_qc",
    description: "Run motion render QC checks against an After Effects render plan.",
    category: "ae",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        compName: { type: "string" },
        outputFormat: { type: "string", enum: formats },
        width: { type: "number" },
        height: { type: "number" },
        durationSeconds: { type: "number" }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const width = Number(input.width ?? 1920);
      const height = Number(input.height ?? 1080);
      const durationSeconds = Number(input.durationSeconds ?? 10);
      const report = {
        schema: "creative.pipeline.ae_motion_qc.v1",
        generatedAt: new Date().toISOString(),
        compName: optionalString(input.compName) ?? "Main",
        status: width > 0 && height > 0 && durationSeconds > 0 ? "pass" : "fail",
        checks: [
          check("resolution_positive", width > 0 && height > 0, { width, height }),
          check("duration_positive", durationSeconds > 0, durationSeconds),
          check("format_supported", !input.outputFormat || formats.includes(String(input.outputFormat)), input.outputFormat ?? "not_provided"),
          check("raw_jsx_disabled", true, true),
          check("license_bypass_absent", true, true)
        ],
        policy: aePolicy()
      };
      const artifact = await context.artifactStore.writeJson("after-effects/motion_qc_report.json", report);
      return { ok: report.status === "pass", message: "After Effects motion QC report written", artifacts: [artifact], data: { report } };
    }
  },
  {
    name: "ae.collect_render_evidence",
    description: "Write render status and output evidence for an After Effects render without claiming live execution unless output is readable.",
    category: "ae",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        commandId: { type: "string" },
        engine: { type: "string", enum: ["aerender", "nexrender", "manual"] },
        compName: { type: "string" },
        outputPath: { type: "string" },
        status: { type: "string", enum: ["queued", "running", "success", "failed", "unknown"] },
        requireOutputExists: { type: "boolean" }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const outputPath = optionalString(input.outputPath);
      let outputReadable = false;
      let resolvedOutputPath: string | undefined;
      if (outputPath) {
        try {
          resolvedOutputPath = await context.artifactStore.assertReadableFile(outputPath);
          outputReadable = true;
        } catch {
          outputReadable = false;
        }
      }
      const requireOutputExists = input.requireOutputExists === true;
      const status = optionalString(input.status) ?? "unknown";
      const reportStatus = outputReadable
        ? status === "failed"
          ? "fail"
          : "pass"
        : requireOutputExists
          ? "fail"
          : "pending";
      const evidence = {
        schema: "creative.pipeline.ae_render_evidence.v1",
        generatedAt: new Date().toISOString(),
        commandId: optionalString(input.commandId) ?? commandId("ae-evidence"),
        engine: optionalString(input.engine) ?? "manual",
        compName: optionalString(input.compName) ?? "Main",
        status,
        reportStatus,
        outputPath,
        resolvedOutputPath,
        checks: [
          check("output_path_declared", Boolean(outputPath), outputPath ?? "not_provided"),
          check("output_readable", outputReadable, outputReadable),
          check("status_not_failed", status !== "failed", status),
          check("raw_jsx_disabled", true, true),
          check("license_bypass_absent", true, true),
          check("live_execution_claim_guarded", outputReadable, outputReadable)
        ],
        policy: {
          ...aePolicy(),
          liveExecutionClaim: outputReadable,
          rawJsx: false
        }
      };
      const artifact = await context.artifactStore.writeJson("after-effects/render_evidence.json", evidence);
      return {
        ok: reportStatus !== "fail",
        message: `After Effects render evidence written: ${reportStatus}`,
        artifacts: [artifact],
        data: { evidence }
      };
    }
  },
  {
    name: "ae.prepare_render_execution",
    description: "Write a bounded After Effects render execution plan for an approved external runner without executing commands.",
    category: "ae",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        commandId: { type: "string" },
        engine: { type: "string", enum: ["aerender", "nexrender"] },
        executablePath: { type: "string" },
        projectPath: { type: "string" },
        templatePath: { type: "string" },
        compName: { type: "string" },
        outputPath: { type: "string" },
        renderSettings: { type: "string" },
        outputModule: { type: "string" },
        jobManifestPath: { type: "string" },
        requireExecutablePath: { type: "boolean" }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const engine = optionalString(input.engine) === "nexrender" ? "nexrender" : "aerender";
      const executablePath = optionalString(input.executablePath);
      let executableReadable = false;
      let resolvedExecutablePath: string | undefined;
      if (executablePath && isAbsolute(executablePath)) {
        try {
          await access(executablePath, constants.X_OK);
          executableReadable = true;
          resolvedExecutablePath = executablePath;
        } catch {
          executableReadable = false;
        }
      }
      const requireExecutablePath = input.requireExecutablePath === true;
      const projectPath = optionalString(input.projectPath);
      const templatePath = optionalString(input.templatePath);
      const outputPath = optionalString(input.outputPath) ?? "artifacts/after-effects/output.mov";
      const jobManifestPath = optionalString(input.jobManifestPath) ?? "artifacts/after-effects/render_queue/nexrender_job.json";
      const executable = executablePath ?? (engine === "aerender" ? "aerender" : "nexrender-cli");
      const argv = engine === "aerender"
        ? buildAerenderArgv(executable, {
          projectPath,
          compName: optionalString(input.compName) ?? "Main",
          outputPath,
          renderSettings: optionalString(input.renderSettings) ?? "Best Settings",
          outputModule: optionalString(input.outputModule) ?? "High Quality"
        })
        : [executable, "--file", jobManifestPath];
      const requiredInputsPresent = engine === "aerender" ? Boolean(projectPath && outputPath) : Boolean(templatePath || jobManifestPath);
      const readyToRun = requiredInputsPresent && (!requireExecutablePath || executableReadable);
      const plan = {
        schema: "creative.pipeline.ae_render_execution_plan.v1",
        generatedAt: new Date().toISOString(),
        commandId: optionalString(input.commandId) ?? commandId("ae-exec"),
        engine,
        mode: "approved_external_runner_plan",
        executable,
        executablePath,
        resolvedExecutablePath,
        executableReadable: executablePath ? executableReadable : "path_lookup_required",
        projectPath,
        templatePath,
        compName: optionalString(input.compName) ?? "Main",
        outputPath,
        jobManifestPath,
        argv,
        readyToRun,
        checks: [
          check("argv_array_only", true, argv),
          check("shell_string_absent", true, true),
          check("raw_jsx_disabled", true, true),
          check("license_bypass_absent", true, true),
          check("required_inputs_present", requiredInputsPresent, { projectPath, templatePath, outputPath, jobManifestPath }),
          check("required_executable_readable", !requireExecutablePath || executableReadable, executablePath ?? "path_lookup_required")
        ],
        expectedSideEffects: ["render_output_only"],
        requiresApproval: true,
        policy: {
          ...aePolicy(),
          externalRunnerOnly: true,
          liveExecutionClaim: false,
          rawJsx: false,
          shellString: false
        }
      };
      const artifact = await context.artifactStore.writeJson("after-effects/render_execution_plan.json", plan);
      const status = renderStatus(plan.commandId, readyToRun ? "ready_for_approved_runner" : "pending_preflight", "After Effects execution plan written");
      const statusArtifact = await context.artifactStore.writeJson("after-effects/render_status.json", status);
      return {
        ok: true,
        message: `After Effects render execution plan written: ${status.status}`,
        artifacts: [artifact, statusArtifact],
        data: { plan, status }
      };
    }
  },
  {
    name: "ae.run_approved_render",
    description: "Run an approved aerender or nexrender render with argv-only execution when explicitly enabled by environment.",
    category: "ae",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        commandId: { type: "string" },
        engine: { type: "string", enum: ["aerender", "nexrender"] },
        executablePath: { type: "string" },
        projectPath: { type: "string" },
        compName: { type: "string" },
        outputPath: { type: "string" },
        renderSettings: { type: "string" },
        outputModule: { type: "string" },
        jobManifestPath: { type: "string" },
        timeoutSeconds: { type: "number" },
        requireEnabled: { type: "boolean" },
        requireOutputExists: { type: "boolean" }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      await context.approvalPolicy.assertAllowed("ae.run_approved_render", "project_write");
      const commandIdValue = optionalString(input.commandId) ?? commandId("ae-run");
      const engine = optionalString(input.engine) === "nexrender" ? "nexrender" : "aerender";
      const enabled = process.env.CREATIVE_MCP_ENABLE_AE_APPROVED_RUNNER === "true";
      const requireEnabled = input.requireEnabled === true;
      const outputPath = safeFutureOutputPath(context, optionalString(input.outputPath) ?? "after-effects/output.mov");
      const executable = executableFor(engine, optionalString(input.executablePath));
      const jobManifestPath = optionalString(input.jobManifestPath) ?? "artifacts/after-effects/render_queue/nexrender_job.json";
      const projectPath = optionalString(input.projectPath);
      const projectReadable = engine === "aerender" ? await readableIfProvided(context, projectPath) : { ok: true };
      const jobReadable = engine === "nexrender" ? await readableIfProvided(context, jobManifestPath) : { ok: true };
      const argv = engine === "aerender"
        ? buildAerenderArgv(executable, {
          projectPath,
          compName: optionalString(input.compName) ?? "Main",
          outputPath,
          renderSettings: optionalString(input.renderSettings) ?? "Best Settings",
          outputModule: optionalString(input.outputModule) ?? "High Quality"
        })
        : [executable, "--file", jobReadable.resolvedPath ?? jobManifestPath];
      const timeoutMs = clampTimeout(input.timeoutSeconds);
      const preflight = {
        enabled,
        projectReadable: projectReadable.ok,
        projectPath: projectReadable.resolvedPath ?? projectPath,
        jobManifestReadable: jobReadable.ok,
        jobManifestPath: jobReadable.resolvedPath ?? jobManifestPath,
        outputPath,
        timeoutMs
      };
      const canRun = enabled && (engine === "aerender" ? projectReadable.ok : jobReadable.ok);
      if (!canRun) {
        const statusValue = renderStatus(
          commandIdValue,
          enabled ? "blocked_preflight" : "blocked_env_disabled",
          enabled
            ? "After Effects approved runner preflight failed"
            : "Set CREATIVE_MCP_ENABLE_AE_APPROVED_RUNNER=true to execute aerender/nexrender"
        );
        const report = renderRunReport(commandIdValue, engine, "preflight", argv, preflight, {
          exitCode: null,
          signal: null,
          stdout: "",
          stderr: "",
          outputReadable: false,
          outputSizeBytes: null
        });
        const artifacts = [
          await context.artifactStore.writeJson("after-effects/render_run_report.json", report),
          await context.artifactStore.writeJson("after-effects/render_status.json", statusValue)
        ];
        return {
          ok: !requireEnabled,
          message: statusValue.message,
          artifacts,
          data: { report, status: statusValue }
        };
      }
      await mkdir(dirname(outputPath), { recursive: true });
      const processResult = await spawnWithCapture(argv[0], argv.slice(1), timeoutMs);
      const output = await outputState(outputPath);
      const statusName = processResult.exitCode === 0 && output.readable
        ? "success"
        : processResult.timedOut
          ? "failed_timeout"
          : "failed";
      const statusValue = renderStatus(commandIdValue, statusName, `After Effects ${engine} finished with ${statusName}`);
      const report = renderRunReport(commandIdValue, engine, "executed", argv, preflight, {
        exitCode: processResult.exitCode,
        signal: processResult.signal,
        stdout: processResult.stdout,
        stderr: processResult.stderr,
        outputReadable: output.readable,
        outputSizeBytes: output.sizeBytes
      });
      const evidence = {
        schema: "creative.pipeline.ae_render_evidence.v1",
        generatedAt: new Date().toISOString(),
        commandId: commandIdValue,
        engine,
        compName: optionalString(input.compName) ?? "Main",
        status: statusName === "success" ? "success" : "failed",
        reportStatus: statusName === "success" ? "pass" : input.requireOutputExists === false ? "pending" : "fail",
        outputPath,
        resolvedOutputPath: output.readable ? outputPath : undefined,
        checks: [
          check("argv_array_only", true, argv),
          check("shell_string_absent", true, true),
          check("raw_jsx_disabled", true, true),
          check("runner_env_enabled", enabled, enabled),
          check("process_exit_zero", processResult.exitCode === 0, processResult.exitCode),
          check("output_readable", output.readable, output.readable)
        ],
        policy: {
          ...aePolicy(),
          approvedRunnerOnly: true,
          liveExecutionClaim: statusName === "success" && output.readable,
          rawJsx: false,
          shellString: false
        }
      };
      const artifacts = [
        await context.artifactStore.writeJson("after-effects/render_run_report.json", report),
        await context.artifactStore.writeJson("after-effects/render_status.json", statusValue),
        await context.artifactStore.writeJson("after-effects/render_evidence.json", evidence)
      ];
      return {
        ok: statusName === "success",
        message: statusValue.message,
        artifacts,
        data: { report, status: statusValue, evidence }
      };
    }
  },
  {
    name: "ae.prepare_template_replacements",
    description: "Write typed After Effects template text/media replacement operations without exposing raw JSX.",
    category: "ae",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        templatePath: { type: "string" },
        compName: { type: "string" },
        outputPath: { type: "string" },
        textReplacements: { type: "array" },
        mediaReplacements: { type: "array" }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const textReplacements = replacementList(input.textReplacements, ["layerName", "text"]);
      const mediaReplacements = replacementList(input.mediaReplacements, ["layerName", "path"]);
      const plan = {
        schema: "creative.pipeline.ae_template_replacement_plan.v1",
        generatedAt: new Date().toISOString(),
        commandId: commandId("ae-template"),
        templatePath: optionalString(input.templatePath),
        compName: optionalString(input.compName) ?? "Main",
        outputPath: optionalString(input.outputPath) ?? "artifacts/after-effects/output.mov",
        operations: [
          ...textReplacements.map((replacement) => ({ type: "replace_text_layer", ...replacement })),
          ...mediaReplacements.map((replacement) => ({ type: "replace_media_layer", ...replacement }))
        ],
        checks: [
          check("typed_operations_only", true, true),
          check("raw_jsx_disabled", true, true),
          check("shell_string_absent", true, true),
          check("operation_count_positive", textReplacements.length + mediaReplacements.length > 0, textReplacements.length + mediaReplacements.length)
        ],
        expectedSideEffects: ["write_artifacts_only", "no_template_overwrite"],
        requiresApproval: true,
        statusJsonPath: "after-effects/render_status.json",
        rollbackHint: "Delete generated render artifacts; template AEP is not modified by this plan.",
        policy: {
          ...aePolicy(),
          rawJsx: false,
          templateOverwrite: false,
          typedReplacementOnly: true
        }
      };
      const artifact = await context.artifactStore.writeJson("after-effects/template_replacement_plan.json", plan);
      return { ok: true, message: "After Effects template replacement plan written", artifacts: [artifact], data: { plan } };
    }
  },
  {
    name: "ae.prepare_file_bridge",
    description: "Write an After Effects file-bridge plan for approved render runners and status collection.",
    category: "ae",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        bridgeDirectory: { type: "string" },
        queueDirectory: { type: "string" },
        statusDirectory: { type: "string" },
        commandTypes: { type: "array", items: { type: "string" } }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const plan = {
        schema: "creative.pipeline.ae_file_bridge_plan.v1",
        generatedAt: new Date().toISOString(),
        bridgeDirectory: optionalString(input.bridgeDirectory) ?? "artifacts/after-effects",
        queueDirectory: optionalString(input.queueDirectory) ?? "artifacts/after-effects/render_queue",
        statusDirectory: optionalString(input.statusDirectory) ?? "artifacts/after-effects/status",
        commandTypes: stringArray(input.commandTypes).length > 0
          ? stringArray(input.commandTypes)
          : ["render_frame_preview", "render_comp", "template_replacement_render", "collect_render_evidence"],
        protocol: {
          queueSchema: "creative.pipeline.ae_render_queue.v1",
          statusSchema: "creative.pipeline.ae_render_status.v1",
          commandFiles: "json_only",
          statusFiles: "json_only"
        },
        checks: [
          check("raw_jsx_disabled_by_default", true, true),
          check("shell_string_absent", true, true),
          check("status_json_required", true, true),
          check("approval_required_for_external_runner", true, true)
        ],
        expectedSideEffects: ["write_artifacts_only"],
        requiresApproval: true,
        policy: {
          ...aePolicy(),
          externalRunnerOnly: true,
          rawJsx: false,
          fileBridge: true
        }
      };
      const artifact = await context.artifactStore.writeJson("after-effects/file_bridge_plan.json", plan);
      return { ok: true, message: "After Effects file bridge plan written", artifacts: [artifact], data: { plan } };
    }
  }
];

function buildRenderPlan(input: Record<string, unknown>) {
  return {
    schema: "creative.pipeline.ae_render_plan.v1",
    generatedAt: new Date().toISOString(),
    provider: "after_effects",
    projectPath: optionalString(input.projectPath),
    templatePath: optionalString(input.templatePath),
    compName: requiredString(input.compName, "Main"),
    outputFormat: optionalString(input.outputFormat) ?? "mov",
    width: Number(input.width ?? 1920),
    height: Number(input.height ?? 1080),
    fps: Number(input.fps ?? 30),
    frame: Number(input.frame ?? 0),
    durationSeconds: Number(input.durationSeconds ?? 10),
    expectedArtifacts: [
      "after-effects/render_plan.json",
      "after-effects/render_status.json",
      "after-effects/motion_qc_report.json",
      "after-effects/output.mov"
    ],
    expectedSideEffects: ["write_artifacts_only"],
    requiresApproval: true,
    rawJsx: false,
    policy: aePolicy()
  };
}

function aePolicy() {
  return {
    rawJsxDefault: false,
    adminApprovalRequiredForJsx: true,
    noLicenseBypass: true,
    renderOnlyPhaseOne: true,
    artifactFirst: true
  };
}

function renderStatus(commandId: string, status: string, message: string) {
  return {
    schema: "creative.pipeline.ae_render_status.v1",
    commandId,
    status,
    message,
    generatedAt: new Date().toISOString()
  };
}

function buildAerenderArgv(executable: string, input: {
  projectPath?: string;
  compName: string;
  outputPath: string;
  renderSettings: string;
  outputModule: string;
}) {
  const argv = [executable];
  if (input.projectPath) {
    argv.push("-project", input.projectPath);
  }
  argv.push("-comp", input.compName);
  argv.push("-output", input.outputPath);
  argv.push("-RStemplate", input.renderSettings);
  argv.push("-OMtemplate", input.outputModule);
  return argv;
}

function executableFor(engine: string, inputExecutable?: string): string {
  if (inputExecutable) {
    return inputExecutable;
  }
  if (engine === "aerender") {
    return process.env.AERENDER_BIN ?? "aerender";
  }
  return process.env.NEXRENDER_BIN ?? "nexrender";
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

function safeFutureOutputPath(context: Parameters<ToolDefinition["execute"]>[0], path: string): string {
  const target = isAbsolute(path) ? resolve(path) : resolve(context.artifactStore.root, path);
  const roots = [context.artifactStore.root, ...(context.artifactStore.workspaceRoots ?? [])].map((root) => resolve(root));
  const inside = roots.some((root) => {
    const delta = relative(root, target);
    return delta === "" || (!delta.startsWith("..") && !isAbsolute(delta));
  });
  if (!inside) {
    throw new Error(`After Effects output path is outside allowed artifact/workspace roots: ${path}`);
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

function renderRunReport(
  commandIdValue: string,
  engine: string,
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
    schema: "creative.pipeline.ae_render_run_report.v1",
    generatedAt: new Date().toISOString(),
    commandId: commandIdValue,
    engine,
    mode,
    argv,
    preflight,
    result,
    checks: [
      check("argv_array_only", true, argv),
      check("shell_string_absent", true, true),
      check("raw_jsx_disabled", true, true),
      check("license_bypass_absent", true, true),
      check("output_readable", result.outputReadable, result.outputReadable)
    ],
    policy: {
      ...aePolicy(),
      approvedRunnerOnly: true,
      rawJsx: false,
      shellString: false,
      liveExecutionClaim: mode === "executed" && result.exitCode === 0 && result.outputReadable
    }
  };
}

function replacementList(value: unknown, requiredKeys: string[]): Array<Record<string, string>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => {
      const replacement: Record<string, string> = {};
      for (const [key, nested] of Object.entries(item)) {
        if (typeof nested === "string" && nested.trim()) {
          replacement[key] = nested.trim();
        }
      }
      return replacement;
    })
    .filter((item) => requiredKeys.every((key) => typeof item[key] === "string" && item[key].length > 0));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function commandId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
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
