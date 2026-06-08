import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname, parse } from "node:path";
import {
  STRUCTURED_TOOL_ERROR_CODES,
  structuredToolError,
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolResult
} from "../../../core/dist/index.js";
import { mediaQcReport, premiereArtifactName, requireMediaPath } from "./shared.js";
import { probeMedia } from "../adapters/ffprobe.js";
import { extractThumbnail, runVmafAdapter } from "../adapters/ffmpegQc.js";
import { enqueuePremiereCommand, findPremiereStatus, listPremiereStatuses, type PremiereCepCommandType, type PremiereCepStatus } from "../adapters/premiereCep.js";
import { runPyloudnormAdapter, runSceneDetectAdapter, runWhisperAdapter } from "../adapters/optionalTools.js";
import { cleanupCaptionCues, formatSrt, formatVtt, parseSubtitle, validateCaptionCues } from "../adapters/srt.js";

const cepCommandTypes: PremiereCepCommandType[] = [
  "build_timeline_from_otio",
  "export_sequence",
  "apply_brand_package",
  "apply_timeline_markers",
  "trim_clip",
  "split_clip",
  "move_clip",
  "add_marker",
  "set_clip_speed",
  "create_sequence",
  "import_media_once",
  "insert_clip_at_time",
  "overwrite_clip_at_time",
  "replace_clip_media",
  "ripple_delete_with_approval",
  "add_transition",
  "apply_effect_preset",
  "apply_lumetri_preset",
  "set_audio_gain",
  "apply_audio_preset",
  "create_caption_track",
  "render_preview_range",
  "export_with_preset"
];

export const premiereTools: ToolDefinition[] = [
  {
    name: "premiere.read_cep_status",
    description: "Read Premiere CEP status JSON files produced by the panel scaffold.",
    category: "premiere",
    risk: "read",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    async execute() {
      const statuses = await listPremiereStatuses();
      return {
        ok: true,
        message: `${statuses.length} Premiere CEP status records found`,
        data: { statuses }
      };
    }
  },
  {
    name: "premiere.await_cep_status",
    description: "Poll Premiere CEP status files until a matching command status is available.",
    category: "premiere",
    risk: "read",
    inputSchema: {
      type: "object",
      properties: {
        commandId: { type: "string" },
        commandType: {
          type: "string",
          enum: cepCommandTypes
        },
        finalizeExportQc: { type: "boolean" },
        timeoutMs: { type: "number" },
        pollIntervalMs: { type: "number" }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const timeoutMs = Math.max(0, Math.min(typeof input.timeoutMs === "number" ? input.timeoutMs : 0, 120000));
      const pollIntervalMs = Math.max(100, Math.min(typeof input.pollIntervalMs === "number" ? input.pollIntervalMs : 1000, 10000));
      const deadline = Date.now() + timeoutMs;
      do {
        const match = await findPremiereStatus({
          commandId: typeof input.commandId === "string" ? input.commandId : undefined,
          commandType: isCepCommandType(input.commandType) ? input.commandType : undefined
        });
        if (match) {
          if (input.finalizeExportQc === true && match.status.commandType === "export_sequence" && match.status.status === "success") {
            const finalized = await finalizeExportStatus(context, input, match.status);
            return {
              ok: finalized.ok,
              message: finalized.message,
              artifacts: finalized.artifacts,
              data: { status: match, finalize: finalized.data }
            };
          }
          return {
            ok: true,
            message: `Premiere CEP status found: ${match.status.status}`,
            data: match
          };
        }
        if (Date.now() >= deadline) {
          break;
        }
        await sleep(pollIntervalMs);
      } while (true);
      return {
        ok: false,
        message: "Premiere CEP status not found before timeout",
        data: { commandId: input.commandId, commandType: input.commandType, timeoutMs }
      };
    }
  },
  {
    name: "premiere.transcribe_media",
    description: "Run WhisperX when available, otherwise write a transcription adapter manifest.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const outputDir = `${context.artifactStore.root}/premiere/transcripts`;
      const result = await runWhisperAdapter(path, outputDir);
      const manifest = {
        source: path,
        adapter: "WhisperX",
        outputDir,
        result,
        error: result.available && !result.error ? null : adapterMissingError("WhisperX", result.error ?? "WhisperX CLI not found"),
        install: "pip install whisperx"
      };
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_transcription_adapter.json"), manifest);
      return {
        ok: result.available && !result.error,
        message: result.available && !result.error ? "WhisperX transcription completed" : "WhisperX adapter manifest written",
        artifacts: [artifact],
        data: manifest
      };
    }
  },
  {
    name: "premiere.detect_scenes",
    description: "Run PySceneDetect when available, otherwise write a scene detection adapter manifest.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const outputDir = `${context.artifactStore.root}/premiere/scenes`;
      const result = await runSceneDetectAdapter(path, outputDir);
      const manifest = {
        source: path,
        adapter: "PySceneDetect",
        outputDir,
        result,
        error: result.available && !result.error ? null : adapterMissingError("PySceneDetect", result.error ?? "PySceneDetect CLI not found"),
        install: "pip install scenedetect[opencv]"
      };
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_scene_detect_adapter.json"), manifest);
      return {
        ok: result.available && !result.error,
        message: result.available && !result.error ? "PySceneDetect completed" : "PySceneDetect adapter manifest written",
        artifacts: [artifact],
        data: manifest
      };
    }
  },
  {
    name: "premiere.measure_loudness",
    description: "Run pyloudnorm when available, otherwise write a loudness adapter manifest.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const output = await context.artifactStore.writeJson(premiereArtifactName(path, "_pyloudnorm_result.json"), {
        status: "pending"
      });
      const result = await runPyloudnormAdapter(path, output);
      const manifest = {
        source: path,
        adapter: "pyloudnorm",
        output,
        result,
        error: result.available && !result.error ? null : adapterMissingError("pyloudnorm", result.error ?? "pyloudnorm dependencies not found"),
        install: "pip install pyloudnorm soundfile"
      };
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_loudness_adapter.json"), manifest);
      return {
        ok: result.available && !result.error,
        message: result.available && !result.error ? "pyloudnorm measurement completed" : "pyloudnorm adapter manifest written",
        artifacts: [artifact, output],
        data: manifest
      };
    }
  },
  {
    name: "premiere.build_timeline_from_otio",
    description: "Queue a Premiere CEP command to build a timeline from an OTIO plan.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: { otioPath: { type: "string" }, sequenceName: { type: "string" } },
      required: ["otioPath"],
      additionalProperties: false
    },
    async execute(context, input) {
      const otioPath = String(input.otioPath ?? "");
      await context.artifactStore.assertReadableFile(otioPath);
      const queued = await enqueuePremiereCommand("build_timeline_from_otio", {
        otioPath,
        sequenceName: String(input.sequenceName ?? "Creative Pipeline Rough Cut")
      });
      return {
        ok: true,
        message: "Premiere CEP timeline command queued",
        artifacts: [queued.path],
        data: queued.command
      };
    }
  },
  {
    name: "premiere.ingest_media",
    description: "Copy media into the artifact store and write an ingest manifest.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const copy = await context.artifactStore.copyIn(path, `premiere/ingest/${basename(path)}`);
      const manifest = await context.artifactStore.writeJson(premiereArtifactName(path, "_ingest.json"), {
        source: path,
        artifact: copy,
        ingestedAt: new Date().toISOString()
      });
      return { ok: true, message: "Media ingested", artifacts: [copy, manifest] };
    }
  },
  {
    name: "premiere.index_media",
    description: "Index media with ffprobe metadata when available.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const probe = await probeMedia(path);
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_media_index.json"), probe);
      return {
        ok: probe.available,
        message: probe.available ? "Media index written" : "Media index written with ffprobe warning",
        artifacts: [artifact],
        data: probe as unknown as Record<string, unknown>
      };
    }
  },
  {
    name: "premiere.run_delivery_qc",
    description: "Write a standardized delivery QC report for an existing media file.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        targetWidth: { type: "number" },
        targetHeight: { type: "number" },
        maxDuration: { type: "number" },
        captionPath: { type: "string" },
        referencePath: { type: "string" },
        targetMinVmaf: { type: "number" },
        modelPath: { type: "string" }
      },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      if (typeof input.captionPath === "string") {
        await context.artifactStore.assertReadableFile(input.captionPath);
      }
      if (typeof input.referencePath === "string") {
        await context.artifactStore.assertReadableFile(input.referencePath);
      }
      if (typeof input.modelPath === "string") {
        await context.artifactStore.assertReadableFile(input.modelPath);
      }
      const vmafLogPath = `${context.artifactStore.root}/premiere/${parse(basename(path)).name}_delivery_vmaf_log.json`;
      const report = await mediaQcReport(path, {
        ...input,
        vmafLogPath
      });
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_delivery_qc_report.json"), report);
      const artifacts = existsSync(vmafLogPath) ? [artifact, vmafLogPath] : [artifact];
      return {
        ok: report.summary.status !== "fail",
        message: `Delivery QC report written: ${report.summary.status}`,
        artifacts,
        data: report as unknown as Record<string, unknown>
      };
    }
  },
  {
    name: "premiere.measure_vmaf",
    description: "Run FFmpeg libvmaf against a reference file, or write an adapter report when libvmaf is unavailable.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        referencePath: { type: "string" },
        targetMinVmaf: { type: "number" },
        modelPath: { type: "string" }
      },
      required: ["path", "referencePath"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      const referencePath = typeof input.referencePath === "string" ? input.referencePath : "";
      await context.artifactStore.assertReadableFile(path);
      await context.artifactStore.assertReadableFile(referencePath);
      if (typeof input.modelPath === "string") {
        await context.artifactStore.assertReadableFile(input.modelPath);
      }
      const targetMinVmaf = typeof input.targetMinVmaf === "number" ? input.targetMinVmaf : 93;
      const logPath = `${context.artifactStore.root}/premiere/${parse(basename(path)).name}_vmaf_log.json`;
      const result = await runVmafAdapter(path, referencePath, logPath, typeof input.modelPath === "string" ? input.modelPath : undefined);
      const report = {
        source: path,
        reference: referencePath,
        targetMinVmaf,
        result,
        error: result.available && !result.error ? null : adapterMissingError("ffmpeg-libvmaf", result.error ?? "FFmpeg libvmaf unavailable"),
        status: result.available && typeof result.mean === "number"
          ? result.mean >= targetMinVmaf ? "pass" : "warn"
          : "adapter_unavailable"
      };
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_vmaf_report.json"), report);
      return {
        ok: report.status === "pass",
        message: result.available
          ? `VMAF report written: ${result.mean ?? "unknown"}`
          : "VMAF adapter report written; FFmpeg libvmaf unavailable or failed",
        artifacts: result.available && result.logPath ? [artifact, result.logPath] : [artifact],
        data: report
      };
    }
  },
  {
    name: "premiere.make_rough_cut",
    description: "Create a simple OTIO-compatible rough-cut plan from a source media file and brief.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        brief: { type: "string", maxLength: 4000 },
        targetDuration: { type: "number" }
      },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const probe = await probeMedia(path);
      const duration = Math.min(
        typeof input.targetDuration === "number" ? input.targetDuration : 60,
        probe.format?.duration ?? 60
      );
      const otio = {
        OTIO_SCHEMA: "Timeline.1",
        name: parse(basename(path)).name,
        metadata: {
          brief: String(input.brief ?? ""),
          generatedBy: "premiere-pro-mcp",
          premiereBridge: "external_cep_required"
        },
        tracks: [
          {
            OTIO_SCHEMA: "Track.1",
            kind: "Video",
            children: [
              {
                OTIO_SCHEMA: "Clip.2",
                name: basename(path),
                media_reference: { target_url: path },
                source_range: {
                  start_time: { value: 0, rate: probe.video?.fps ?? 30 },
                  duration: { value: Math.round(duration * (probe.video?.fps ?? 30)), rate: probe.video?.fps ?? 30 }
                }
              }
            ]
          }
        ]
      };
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_rough_cut.otio"), otio);
      return { ok: true, message: "Rough-cut OTIO plan written", artifacts: [artifact], data: otio };
    }
  },
  {
    name: "premiere.build_project_delivery",
    description: "Build a project-specific timeline, brand, and export delivery plan, then queue CEP commands.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        template: {
          type: "string",
          enum: ["youtube_shorts", "youtube_16x9", "podcast_clip", "course_lesson", "ad_creative"]
        },
        sequenceName: { type: "string", maxLength: 120 },
        targetDuration: { type: "number" },
        preset: { type: "string", enum: ["1080x1920_h264_social", "1920x1080_h264", "1080x1080_h264"] },
        outputPath: { type: "string" },
        brand: { type: "object" }
      },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const probe = await probeMedia(path);
      const templateName = isProjectTemplate(input.template) ? input.template : "youtube_shorts";
      const template = projectTemplates[templateName];
      const fps = probe.video?.fps ?? 30;
      const sourceDuration = probe.format?.duration ?? template.defaultDuration;
      const duration = Math.max(1, Math.min(
        typeof input.targetDuration === "number" ? input.targetDuration : template.defaultDuration,
        sourceDuration
      ));
      const baseName = parse(basename(path)).name;
      const sequenceName = typeof input.sequenceName === "string" && input.sequenceName.trim()
        ? input.sequenceName.trim()
        : `${template.label} - ${baseName}`;
      const outputPath = typeof input.outputPath === "string" && input.outputPath
        ? input.outputPath
        : `${context.artifactStore.root}/premiere/exports/${baseName}_${templateName}.mp4`;
      const preset = typeof input.preset === "string" ? input.preset : template.preset;
      const brand = input.brand && typeof input.brand === "object" ? input.brand as Record<string, unknown> : {};

      const projectTemplate = {
        source: path,
        template: templateName,
        sequenceName,
        dimensions: { width: template.width, height: template.height },
        fps,
        duration,
        safeAreas: template.safeAreas,
        audio: { targetLufs: template.targetLufs },
        brand,
        generatedAt: new Date().toISOString()
      };
      const otio = {
        OTIO_SCHEMA: "Timeline.1",
        name: sequenceName,
        metadata: {
          generatedBy: "premiere-pro-mcp",
          template: templateName,
          dimensions: { width: template.width, height: template.height },
          deliveryPreset: preset,
          brand
        },
        tracks: [
          {
            OTIO_SCHEMA: "Track.1",
            kind: "Video",
            children: [
              {
                OTIO_SCHEMA: "Clip.2",
                name: basename(path),
                media_reference: { target_url: path },
                source_range: {
                  start_time: { value: 0, rate: fps },
                  duration: { value: Math.round(duration * fps), rate: fps }
                },
                metadata: { role: "primary_picture" }
              }
            ]
          }
        ]
      };
      const exportPlan = {
        source: path,
        template: templateName,
        sequenceName,
        preset,
        presetPath: "",
        outputPath,
        dimensions: { width: template.width, height: template.height },
        targetLufs: template.targetLufs,
        deliveryQcAfterExport: true,
        bridge: "external_premiere_cep_required"
      };
      const brandPackage = {
        ...buildBrandPackage(path, brand),
        template: templateName,
        appliesTo: template.brandTargets
      };

      const templateArtifact = await context.artifactStore.writeJson(`premiere/${baseName}_${templateName}_project_template.json`, projectTemplate);
      const otioArtifact = await context.artifactStore.writeJson(`premiere/${baseName}_${templateName}_project_timeline.otio`, otio);
      const exportArtifact = await context.artifactStore.writeJson(`premiere/${baseName}_${templateName}_project_export_plan.json`, exportPlan);
      const brandArtifact = await context.artifactStore.writeJson(`premiere/${baseName}_${templateName}_project_brand_package.json`, brandPackage);
      const timelineCommand = await enqueuePremiereCommand("build_timeline_from_otio", {
        otioPath: otioArtifact,
        sequenceName,
        template: templateName
      });
      const brandCommand = await enqueuePremiereCommand("apply_brand_package", brandPackage);
      const exportCommand = await enqueuePremiereCommand("export_sequence", exportPlan);

      return {
        ok: true,
        message: "Project delivery timeline, brand, and export commands queued",
        artifacts: [
          templateArtifact,
          otioArtifact,
          exportArtifact,
          brandArtifact,
          timelineCommand.path,
          brandCommand.path,
          exportCommand.path
        ],
        data: {
          template: projectTemplate,
          otio,
          exportPlan,
          brandPackage,
          commands: {
            timeline: timelineCommand.command,
            brand: brandCommand.command,
            export: exportCommand.command
          }
        }
      };
    }
  },
  {
    name: "premiere.auto_caption",
    description: "Create an SRT caption file from supplied transcript text, or a placeholder when ASR is not configured.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        transcript: { type: "string", maxLength: 20000 }
      },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const text = typeof input.transcript === "string" && input.transcript.trim()
        ? input.transcript.trim()
        : "[ASR adapter required: configure WhisperX, faster-whisper, or whisper.cpp]";
      const srt = `1\n00:00:00,000 --> 00:00:03,000\n${text}\n`;
      const artifact = await context.artifactStore.writeText(premiereArtifactName(path, "_captions.srt"), srt);
      return { ok: true, message: "Caption file written", artifacts: [artifact] };
    }
  },
  {
    name: "premiere.mix_audio",
    description: "Create an audio mix plan with loudness targets for external adapters.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        targetLufs: { type: "number" }
      },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const plan = {
        source: path,
        targetLufs: typeof input.targetLufs === "number" ? input.targetLufs : -14,
        adapters: ["ffmpeg loudnorm", "pyloudnorm"],
        status: "external_adapter_required"
      };
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_audio_mix_plan.json"), plan);
      return { ok: true, message: "Audio mix plan written", artifacts: [artifact], data: plan };
    }
  },
  {
    name: "premiere.export_video",
    description: "Create an export plan; real Premiere export requires the external CEP bridge and approval.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        preset: { type: "string", enum: ["1080x1920_h264_social", "1920x1080_h264", "1080x1080_h264"] },
        presetPath: { type: "string" },
        outputPath: { type: "string" }
      },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const plan = {
        source: path,
        preset: String(input.preset ?? "1080x1920_h264_social"),
        presetPath: typeof input.presetPath === "string" ? input.presetPath : "",
        bridge: "external_premiere_cep_required",
        requiresApproval: true,
        outputPath: String(input.outputPath ?? `${context.artifactStore.root}/premiere/exports/${parse(basename(path)).name}_final.mp4`),
        deliveryQcAfterExport: true
      };
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_export_plan.json"), plan);
      const queued = await enqueuePremiereCommand("export_sequence", plan);
      return {
        ok: true,
        message: "Export plan written and Premiere CEP export command queued",
        artifacts: [artifact, queued.path],
        data: { plan, command: queued.command }
      };
    }
  },
  {
    name: "premiere.finalize_export_qc",
    description: "Resolve an export CEP status and run delivery QC when the exported file exists.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        commandId: { type: "string" },
        outputPath: { type: "string" },
        targetWidth: { type: "number" },
        targetHeight: { type: "number" },
        maxDuration: { type: "number" },
        captionPath: { type: "string" },
        referencePath: { type: "string" },
        targetMinVmaf: { type: "number" },
        modelPath: { type: "string" }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const statusRecord = typeof input.commandId === "string"
        ? await findPremiereStatus({ commandId: input.commandId, commandType: "export_sequence" })
        : undefined;
      const outputPath = resolveExportOutputPath(input, statusRecord?.status);
      if (!outputPath) {
        const pending = await context.artifactStore.writeJson("premiere/export_qc_pending.json", {
          commandId: input.commandId ?? null,
          status: statusRecord?.status ?? null,
          reason: "missing_output_path"
        });
        return {
          ok: false,
          message: "Export QC pending: outputPath is missing",
          artifacts: [pending],
          data: { status: statusRecord?.status ?? null }
        };
      }
      if (!existsSync(outputPath)) {
        const pending = await context.artifactStore.writeJson(premiereArtifactName(outputPath, "_export_qc_pending.json"), {
          commandId: input.commandId ?? null,
          outputPath,
          status: statusRecord?.status ?? null,
          reason: "output_file_not_found"
        });
        return {
          ok: false,
          message: "Export QC pending: output file not found",
          artifacts: [pending],
          data: { outputPath, status: statusRecord?.status ?? null }
        };
      }
      await context.artifactStore.assertReadableFile(outputPath);
      if (typeof input.captionPath === "string") {
        await context.artifactStore.assertReadableFile(input.captionPath);
      }
      if (typeof input.referencePath === "string") {
        await context.artifactStore.assertReadableFile(input.referencePath);
      }
      if (typeof input.modelPath === "string") {
        await context.artifactStore.assertReadableFile(input.modelPath);
      }
      const vmafLogPath = `${context.artifactStore.root}/premiere/${parse(basename(outputPath)).name}_export_vmaf_log.json`;
      const report = await mediaQcReport(outputPath, {
        ...input,
        vmafLogPath
      });
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(outputPath, "_export_delivery_qc_report.json"), {
        cepStatus: statusRecord?.status ?? null,
        report
      });
      const artifacts = existsSync(vmafLogPath) ? [artifact, vmafLogPath] : [artifact];
      return {
        ok: report.summary.status !== "fail",
        message: `Export delivery QC report written: ${report.summary.status}`,
        artifacts,
        data: { status: statusRecord?.status ?? null, report }
      };
    }
  },
  {
    name: "premiere.export_social_variants",
    description: "Create multi-platform export profile manifests for vertical, square, and horizontal delivery.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, platforms: { type: "array" } },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const platforms = Array.isArray(input.platforms) ? input.platforms : ["youtube_shorts", "tiktok", "instagram_reels", "youtube_16x9"];
      const manifest = {
        source: path,
        platforms,
        profiles: [
          { name: "vertical_1080x1920", codec: "h264", safeTitle: true },
          { name: "square_1080x1080", codec: "h264", safeTitle: true },
          { name: "horizontal_1920x1080", codec: "h264", safeTitle: true }
        ],
        deliveryQcRequired: true
      };
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_social_variants.json"), manifest);
      return { ok: true, message: "Social export variant manifest written", artifacts: [artifact], data: manifest };
    }
  },
  {
    name: "premiere.apply_brand_package",
    description: "Queue a brand package application command for captions, colors, fonts, and graphics.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, brand: { type: "object" } },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const manifest = buildBrandPackage(path, input.brand);
      const preview = {
        source: path,
        schema: "creative.pipeline.brand_preview.v1",
        captionStyle: manifest.captionStyle,
        colors: manifest.colors,
        typography: manifest.typography,
        safeMargins: manifest.safeMargins,
        appliesTo: manifest.appliesTo
      };
      const previewArtifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_brand_preview.json"), preview);
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_brand_package.json"), manifest);
      const queued = await enqueuePremiereCommand("apply_brand_package", manifest);
      return {
        ok: true,
        message: "Brand package manifest, preview, and Premiere CEP command queued",
        artifacts: [artifact, previewArtifact, queued.path],
        data: { manifest, preview, command: queued.command }
      };
    }
  },
  {
    name: "premiere.apply_timeline_markers",
    description: "Queue safe-margin, intro, outro, and chapter marker metadata for a Premiere sequence.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        sequenceName: { type: "string" },
        safeMargins: { type: "object" },
        intro: { type: "object" },
        outro: { type: "object" },
        markers: { type: "array" }
      },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const payload = {
        source: path,
        sequenceName: typeof input.sequenceName === "string" ? input.sequenceName : undefined,
        safeMargins: input.safeMargins && typeof input.safeMargins === "object"
          ? input.safeMargins
          : { titleSafe: 0.9, actionSafe: 0.95, captionBottomClearance: 0.14 },
        markers: buildTimelineMarkers(input),
        bridge: "external_premiere_cep_required"
      };
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_timeline_markers.json"), payload);
      const queued = await enqueuePremiereCommand("apply_timeline_markers", payload);
      return {
        ok: true,
        message: "Timeline marker manifest written and Premiere CEP command queued",
        artifacts: [artifact, queued.path],
        data: { manifest: payload, command: queued.command }
      };
    }
  },
  {
    name: "premiere.trim_clip",
    description: "Queue a typed Premiere CEP command to trim a clip without exposing raw ExtendScript.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        sequenceName: { type: "string" },
        trackType: { type: "string", enum: ["video", "audio"] },
        trackIndex: { type: "number" },
        clipIndex: { type: "number" },
        clipName: { type: "string" },
        inPointSeconds: { type: "number" },
        outPointSeconds: { type: "number" },
        startSeconds: { type: "number" },
        endSeconds: { type: "number" },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["trackIndex", "clipIndex"],
      additionalProperties: false
    },
    async execute(context, input) {
      await assertOptionalAnchorPath(context, input);
      const payload = typedEditPayload(input, "trim_clip", {
        trim: {
          inPointSeconds: numberOrUndefined(input.inPointSeconds),
          outPointSeconds: numberOrUndefined(input.outPointSeconds),
          startSeconds: numberOrUndefined(input.startSeconds),
          endSeconds: numberOrUndefined(input.endSeconds)
        }
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/trim_clip.json", payload);
      const queued = await enqueuePremiereCommand("trim_clip", payload, editCommandOptions(input, [
        "clip timing may change",
        "sequence duration may change"
      ]));
      return typedEditResult("Trim clip command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.split_clip",
    description: "Queue a typed Premiere CEP command to split a clip at a timeline time.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        sequenceName: { type: "string" },
        trackType: { type: "string", enum: ["video", "audio"] },
        trackIndex: { type: "number" },
        clipIndex: { type: "number" },
        clipName: { type: "string" },
        splitSeconds: { type: "number" },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["trackIndex", "clipIndex", "splitSeconds"],
      additionalProperties: false
    },
    async execute(context, input) {
      await assertOptionalAnchorPath(context, input);
      const payload = typedEditPayload(input, "split_clip", {
        splitSeconds: numberOrUndefined(input.splitSeconds)
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/split_clip.json", payload);
      const queued = await enqueuePremiereCommand("split_clip", payload, editCommandOptions(input, [
        "clip may be cut into two timeline items"
      ]));
      return typedEditResult("Split clip command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.move_clip",
    description: "Queue a typed Premiere CEP command to move a clip in time or to another track.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        sequenceName: { type: "string" },
        trackType: { type: "string", enum: ["video", "audio"] },
        trackIndex: { type: "number" },
        clipIndex: { type: "number" },
        clipName: { type: "string" },
        startSeconds: { type: "number" },
        targetTrackIndex: { type: "number" },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["trackIndex", "clipIndex", "startSeconds"],
      additionalProperties: false
    },
    async execute(context, input) {
      await assertOptionalAnchorPath(context, input);
      const payload = typedEditPayload(input, "move_clip", {
        startSeconds: numberOrUndefined(input.startSeconds),
        targetTrackIndex: numberOrUndefined(input.targetTrackIndex)
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/move_clip.json", payload);
      const queued = await enqueuePremiereCommand("move_clip", payload, editCommandOptions(input, [
        "clip start time may change",
        "clip track may change"
      ]));
      return typedEditResult("Move clip command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.add_marker",
    description: "Queue a typed Premiere CEP command to add a sequence marker.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        sequenceName: { type: "string" },
        timeSeconds: { type: "number" },
        durationSeconds: { type: "number" },
        name: { type: "string" },
        comments: { type: "string" },
        color: { type: "string" },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["timeSeconds", "name"],
      additionalProperties: false
    },
    async execute(context, input) {
      await assertOptionalAnchorPath(context, input);
      const payload = typedEditPayload(input, "add_marker", {
        marker: {
          timeSeconds: numberOrUndefined(input.timeSeconds),
          durationSeconds: numberOrUndefined(input.durationSeconds),
          name: String(input.name ?? "Creative Pipeline Marker"),
          comments: typeof input.comments === "string" ? input.comments : "",
          color: typeof input.color === "string" ? input.color : undefined
        }
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/add_marker.json", payload);
      const queued = await enqueuePremiereCommand("add_marker", payload, editCommandOptions(input, [
        "sequence marker may be added"
      ]));
      return typedEditResult("Add marker command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.set_clip_speed",
    description: "Queue a typed Premiere CEP command to set clip playback speed.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        sequenceName: { type: "string" },
        trackType: { type: "string", enum: ["video", "audio"] },
        trackIndex: { type: "number" },
        clipIndex: { type: "number" },
        clipName: { type: "string" },
        speedPercent: { type: "number" },
        maintainPitch: { type: "boolean" },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["trackIndex", "clipIndex", "speedPercent"],
      additionalProperties: false
    },
    async execute(context, input) {
      await assertOptionalAnchorPath(context, input);
      const payload = typedEditPayload(input, "set_clip_speed", {
        speedPercent: numberOrUndefined(input.speedPercent),
        maintainPitch: input.maintainPitch === true
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/set_clip_speed.json", payload);
      const queued = await enqueuePremiereCommand("set_clip_speed", payload, editCommandOptions(input, [
        "clip playback speed may change",
        "clip duration may change"
      ]));
      return typedEditResult("Set clip speed command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.create_sequence",
    description: "Queue a typed Premiere CEP command to create a sequence without exposing raw ExtendScript.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        sequenceName: { type: "string" },
        presetPath: { type: "string" },
        width: { type: "number" },
        height: { type: "number" },
        fps: { type: "number" },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["sequenceName"],
      additionalProperties: false
    },
    async execute(context, input) {
      const payload = typedEditPayload(input, "create_sequence", {
        sequence: {
          name: stringOrUndefined(input.sequenceName) ?? "Creative Pipeline Sequence",
          presetPath: stringOrUndefined(input.presetPath),
          settings: {
            width: numberOrUndefined(input.width),
            height: numberOrUndefined(input.height),
            fps: numberOrUndefined(input.fps)
          }
        }
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/create_sequence.json", payload);
      const queued = await enqueuePremiereCommand("create_sequence", payload, editCommandOptions(input, [
        "new sequence may be created",
        "active sequence may change"
      ]));
      return typedEditResult("Create sequence command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.import_media_once",
    description: "Queue a typed Premiere CEP command to import media only when it is not already in the project.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        mediaPath: { type: "string" },
        binName: { type: "string" },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["mediaPath"],
      additionalProperties: false
    },
    async execute(context, input) {
      const mediaPath = await assertReadableInputPath(context, input.mediaPath, "mediaPath");
      const payload = typedEditPayload(input, "import_media_once", {
        media: {
          path: mediaPath,
          binName: stringOrUndefined(input.binName)
        }
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/import_media_once.json", payload);
      const queued = await enqueuePremiereCommand("import_media_once", payload, editCommandOptions(input, [
        "media may be imported into the project"
      ]));
      return typedEditResult("Import media once command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.insert_clip_at_time",
    description: "Queue a typed Premiere CEP command to insert media at a timeline time.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        mediaPath: { type: "string" },
        sequenceName: { type: "string" },
        trackType: { type: "string", enum: ["video", "audio"] },
        trackIndex: { type: "number" },
        startSeconds: { type: "number" },
        inPointSeconds: { type: "number" },
        outPointSeconds: { type: "number" },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["mediaPath", "startSeconds"],
      additionalProperties: false
    },
    async execute(context, input) {
      const mediaPath = await assertReadableInputPath(context, input.mediaPath, "mediaPath");
      const payload = typedEditPayload(input, "insert_clip_at_time", {
        clip: {
          mediaPath,
          startSeconds: numberOrUndefined(input.startSeconds),
          inPointSeconds: numberOrUndefined(input.inPointSeconds),
          outPointSeconds: numberOrUndefined(input.outPointSeconds),
          mode: "insert"
        }
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/insert_clip_at_time.json", payload);
      const queued = await enqueuePremiereCommand("insert_clip_at_time", payload, editCommandOptions(input, [
        "media may be imported",
        "clip may be inserted on the timeline",
        "downstream clips may shift"
      ]));
      return typedEditResult("Insert clip at time command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.overwrite_clip_at_time",
    description: "Queue a typed Premiere CEP command to overwrite media at a timeline time.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        mediaPath: { type: "string" },
        sequenceName: { type: "string" },
        trackType: { type: "string", enum: ["video", "audio"] },
        trackIndex: { type: "number" },
        startSeconds: { type: "number" },
        inPointSeconds: { type: "number" },
        outPointSeconds: { type: "number" },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["mediaPath", "startSeconds"],
      additionalProperties: false
    },
    async execute(context, input) {
      const mediaPath = await assertReadableInputPath(context, input.mediaPath, "mediaPath");
      const payload = typedEditPayload(input, "overwrite_clip_at_time", {
        clip: {
          mediaPath,
          startSeconds: numberOrUndefined(input.startSeconds),
          inPointSeconds: numberOrUndefined(input.inPointSeconds),
          outPointSeconds: numberOrUndefined(input.outPointSeconds),
          mode: "overwrite"
        }
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/overwrite_clip_at_time.json", payload);
      const queued = await enqueuePremiereCommand("overwrite_clip_at_time", payload, editCommandOptions(input, [
        "media may be imported",
        "timeline content may be overwritten"
      ]));
      return typedEditResult("Overwrite clip at time command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.replace_clip_media",
    description: "Queue a typed Premiere CEP command to replace the source media for a targeted clip.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        newMediaPath: { type: "string" },
        sequenceName: { type: "string" },
        trackType: { type: "string", enum: ["video", "audio"] },
        trackIndex: { type: "number" },
        clipIndex: { type: "number" },
        clipName: { type: "string" },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["newMediaPath", "trackIndex", "clipIndex"],
      additionalProperties: false
    },
    async execute(context, input) {
      const newMediaPath = await assertReadableInputPath(context, input.newMediaPath, "newMediaPath");
      const payload = typedEditPayload(input, "replace_clip_media", {
        replacement: {
          newMediaPath
        }
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/replace_clip_media.json", payload);
      const queued = await enqueuePremiereCommand("replace_clip_media", payload, editCommandOptions(input, [
        "clip source media may change",
        "media may be imported"
      ]));
      return typedEditResult("Replace clip media command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.ripple_delete_with_approval",
    description: "Queue an approval-gated Premiere CEP command to ripple delete a targeted timeline clip.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        sequenceName: { type: "string" },
        trackType: { type: "string", enum: ["video", "audio"] },
        trackIndex: { type: "number" },
        clipIndex: { type: "number" },
        clipName: { type: "string" },
        approvalReason: { type: "string" },
        confirmed: { type: "boolean" },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["trackIndex", "clipIndex", "approvalReason", "confirmed"],
      additionalProperties: false
    },
    async execute(context, input) {
      const payload = typedEditPayload(input, "ripple_delete_with_approval", {
        delete: {
          mode: "ripple",
          approval: {
            required: true,
            reason: stringOrUndefined(input.approvalReason),
            confirmed: input.confirmed === true
          }
        }
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/ripple_delete_with_approval.json", payload);
      const queued = await enqueuePremiereCommand("ripple_delete_with_approval", payload, editCommandOptions(input, [
        "clip may be removed",
        "downstream clips may shift"
      ]));
      return typedEditResult("Ripple delete command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.add_transition",
    description: "Queue a typed Premiere CEP command to add a transition to a targeted edit point.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        sequenceName: { type: "string" },
        trackType: { type: "string", enum: ["video", "audio"] },
        trackIndex: { type: "number" },
        clipIndex: { type: "number" },
        clipName: { type: "string" },
        transitionName: { type: "string" },
        durationSeconds: { type: "number" },
        alignment: { type: "string", enum: ["start", "center", "end"] },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["trackIndex", "clipIndex", "transitionName"],
      additionalProperties: false
    },
    async execute(context, input) {
      const payload = typedEditPayload(input, "add_transition", {
        transition: {
          name: stringOrUndefined(input.transitionName),
          durationSeconds: numberOrUndefined(input.durationSeconds),
          alignment: stringOrUndefined(input.alignment) ?? "center"
        }
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/add_transition.json", payload);
      const queued = await enqueuePremiereCommand("add_transition", payload, editCommandOptions(input, [
        "transition may be added to the timeline"
      ]));
      return typedEditResult("Add transition command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.apply_effect_preset",
    description: "Queue a typed Premiere CEP command to apply a bounded effect preset to a targeted clip.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        sequenceName: { type: "string" },
        trackType: { type: "string", enum: ["video", "audio"] },
        trackIndex: { type: "number" },
        clipIndex: { type: "number" },
        clipName: { type: "string" },
        presetName: { type: "string" },
        presetPath: { type: "string" },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["trackIndex", "clipIndex", "presetName"],
      additionalProperties: false
    },
    async execute(context, input) {
      const payload = typedEditPayload(input, "apply_effect_preset", {
        effectPreset: {
          name: stringOrUndefined(input.presetName),
          path: stringOrUndefined(input.presetPath)
        }
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/apply_effect_preset.json", payload);
      const queued = await enqueuePremiereCommand("apply_effect_preset", payload, editCommandOptions(input, [
        "clip effects may change"
      ]));
      return typedEditResult("Apply effect preset command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.apply_lumetri_preset",
    description: "Queue a typed Premiere CEP command to apply a Lumetri preset or look to a targeted clip.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        sequenceName: { type: "string" },
        trackIndex: { type: "number" },
        clipIndex: { type: "number" },
        clipName: { type: "string" },
        presetName: { type: "string" },
        lutPath: { type: "string" },
        intensity: { type: "number" },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["trackIndex", "clipIndex", "presetName"],
      additionalProperties: false
    },
    async execute(context, input) {
      const payload = typedEditPayload({ ...input, trackType: "video" }, "apply_lumetri_preset", {
        lumetriPreset: {
          name: stringOrUndefined(input.presetName),
          lutPath: stringOrUndefined(input.lutPath),
          intensity: numberOrUndefined(input.intensity)
        }
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/apply_lumetri_preset.json", payload);
      const queued = await enqueuePremiereCommand("apply_lumetri_preset", payload, editCommandOptions(input, [
        "clip color settings may change"
      ]));
      return typedEditResult("Apply Lumetri preset command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.set_audio_gain",
    description: "Queue a typed Premiere CEP command to set audio gain on a targeted clip.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        sequenceName: { type: "string" },
        trackIndex: { type: "number" },
        clipIndex: { type: "number" },
        clipName: { type: "string" },
        gainDb: { type: "number" },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["trackIndex", "clipIndex", "gainDb"],
      additionalProperties: false
    },
    async execute(context, input) {
      const payload = typedEditPayload({ ...input, trackType: "audio" }, "set_audio_gain", {
        audioGain: {
          gainDb: numberOrUndefined(input.gainDb)
        }
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/set_audio_gain.json", payload);
      const queued = await enqueuePremiereCommand("set_audio_gain", payload, editCommandOptions(input, [
        "clip audio gain may change"
      ]));
      return typedEditResult("Set audio gain command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.apply_audio_preset",
    description: "Queue a typed Premiere CEP command to apply an audio preset to a targeted clip.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        sequenceName: { type: "string" },
        trackIndex: { type: "number" },
        clipIndex: { type: "number" },
        clipName: { type: "string" },
        presetName: { type: "string" },
        presetPath: { type: "string" },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["trackIndex", "clipIndex", "presetName"],
      additionalProperties: false
    },
    async execute(context, input) {
      const payload = typedEditPayload({ ...input, trackType: "audio" }, "apply_audio_preset", {
        audioPreset: {
          name: stringOrUndefined(input.presetName),
          path: stringOrUndefined(input.presetPath)
        }
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/apply_audio_preset.json", payload);
      const queued = await enqueuePremiereCommand("apply_audio_preset", payload, editCommandOptions(input, [
        "clip audio effects may change"
      ]));
      return typedEditResult("Apply audio preset command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.create_caption_track",
    description: "Queue a typed Premiere CEP command to create or attach a caption track from a subtitle file.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        captionPath: { type: "string" },
        sequenceName: { type: "string" },
        format: { type: "string", enum: ["srt", "vtt"] },
        startSeconds: { type: "number" },
        styleName: { type: "string" },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["captionPath"],
      additionalProperties: false
    },
    async execute(context, input) {
      const captionPath = await assertReadableInputPath(context, input.captionPath, "captionPath");
      const payload = typedEditPayload(input, "create_caption_track", {
        captions: {
          path: captionPath,
          format: subtitleFormat(captionPath, input.format),
          startSeconds: numberOrUndefined(input.startSeconds) ?? 0,
          styleName: stringOrUndefined(input.styleName)
        }
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/create_caption_track.json", payload);
      const queued = await enqueuePremiereCommand("create_caption_track", payload, editCommandOptions(input, [
        "caption media may be imported",
        "caption track may be added"
      ]));
      return typedEditResult("Create caption track command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.render_preview_range",
    description: "Queue a typed Premiere CEP command to render timeline previews for a bounded range.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        sequenceName: { type: "string" },
        startSeconds: { type: "number" },
        endSeconds: { type: "number" },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["startSeconds", "endSeconds"],
      additionalProperties: false
    },
    async execute(context, input) {
      const payload = typedEditPayload(input, "render_preview_range", {
        previewRange: {
          startSeconds: numberOrUndefined(input.startSeconds),
          endSeconds: numberOrUndefined(input.endSeconds)
        }
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/render_preview_range.json", payload);
      const queued = await enqueuePremiereCommand("render_preview_range", payload, editCommandOptions(input, [
        "preview files may be rendered"
      ]));
      return typedEditResult("Render preview range command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.export_with_preset",
    description: "Queue a typed Premiere CEP command to export the active sequence with a named preset.",
    category: "premiere",
    risk: "project_write",
    inputSchema: {
      type: "object",
      properties: {
        sequenceName: { type: "string" },
        outputPath: { type: "string" },
        presetName: { type: "string" },
        presetPath: { type: "string" },
        deliveryProfile: { type: "string" },
        idempotencyKey: { type: "string" },
        rollbackHint: { type: "string" }
      },
      required: ["outputPath", "presetName"],
      additionalProperties: false
    },
    async execute(context, input) {
      const payload = typedEditPayload(input, "export_with_preset", {
        export: {
          outputPath: stringOrUndefined(input.outputPath),
          presetName: stringOrUndefined(input.presetName),
          presetPath: stringOrUndefined(input.presetPath),
          deliveryProfile: stringOrUndefined(input.deliveryProfile)
        }
      });
      const artifact = await context.artifactStore.writeJson("premiere/typed_edits/export_with_preset.json", payload);
      const queued = await enqueuePremiereCommand("export_with_preset", payload, editCommandOptions(input, [
        "export job may be queued",
        "output file may be written"
      ]));
      return typedEditResult("Export with preset command queued", artifact, queued.path, payload, queued.command);
    }
  },
  {
    name: "premiere.validate_subtitles",
    description: "Validate SRT/VTT cues for timing, overlap, empty text, and reading speed.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        format: { type: "string", enum: ["srt", "vtt"] },
        maxCharsPerSecond: { type: "number" },
        maxWordsPerMinute: { type: "number" }
      },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const validation = await subtitleValidation(path, input.format);
      const maxCharsPerSecond = typeof input.maxCharsPerSecond === "number" ? input.maxCharsPerSecond : 20;
      const maxWordsPerMinute = typeof input.maxWordsPerMinute === "number" ? input.maxWordsPerMinute : 180;
      const report = {
        schema: "creative.pipeline.subtitle_qc.v1",
        source: path,
        format: subtitleFormat(path, input.format),
        thresholds: { maxCharsPerSecond, maxWordsPerMinute },
        validation,
        status:
          validation.invalidTimings === 0
          && validation.emptyCues === 0
          && validation.overlaps === 0
          && validation.maxCharsPerSecond <= maxCharsPerSecond
          && validation.maxWordsPerMinute <= maxWordsPerMinute
            ? "pass"
            : "warn"
      };
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_subtitle_qc_report.json"), report);
      return {
        ok: report.status === "pass",
        message: `Subtitle validation written: ${report.status}`,
        artifacts: [artifact],
        data: report
      };
    }
  },
  {
    name: "premiere.cleanup_subtitles",
    description: "Normalize SRT/VTT captions, remove empty cues, repair overlaps, and wrap long lines.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        format: { type: "string", enum: ["srt", "vtt"] },
        outputFormat: { type: "string", enum: ["srt", "vtt"] },
        maxCharsPerLine: { type: "number" }
      },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const format = subtitleFormat(path, input.format);
      const outputFormat = input.outputFormat === "vtt" ? "vtt" : "srt";
      const text = await readFile(path, "utf8");
      const cues = parseSubtitle(text, format);
      const cleaned = cleanupCaptionCues(cues, typeof input.maxCharsPerLine === "number" ? input.maxCharsPerLine : 42);
      const output = outputFormat === "vtt" ? formatVtt(cleaned) : formatSrt(cleaned);
      const suffix = outputFormat === "vtt" ? "_cleaned.vtt" : "_cleaned.srt";
      const artifact = await context.artifactStore.writeText(premiereArtifactName(path, suffix), output);
      const report = {
        schema: "creative.pipeline.subtitle_cleanup.v1",
        source: path,
        inputFormat: format,
        outputFormat,
        before: validateCaptionCues(cues),
        after: validateCaptionCues(cleaned)
      };
      const reportArtifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_subtitle_cleanup_report.json"), report);
      return {
        ok: report.after.invalidTimings === 0 && report.after.overlaps === 0,
        message: "Subtitle cleanup artifacts written",
        artifacts: [artifact, reportArtifact],
        data: report
      };
    }
  },
  {
    name: "premiere.watch_export_output",
    description: "Poll an export output path and run delivery QC once the file appears.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        commandId: { type: "string" },
        outputPath: { type: "string" },
        timeoutMs: { type: "number" },
        pollIntervalMs: { type: "number" },
        captionPath: { type: "string" },
        targetWidth: { type: "number" },
        targetHeight: { type: "number" },
        maxDuration: { type: "number" }
      },
      additionalProperties: false
    },
    async execute(context, input) {
      const statusRecord = typeof input.commandId === "string"
        ? await findPremiereStatus({ commandId: input.commandId, commandType: "export_sequence" })
        : undefined;
      const outputPath = resolveExportOutputPath(input, statusRecord?.status);
      const timeoutMs = Math.max(0, Math.min(typeof input.timeoutMs === "number" ? input.timeoutMs : 0, 120000));
      const pollIntervalMs = Math.max(100, Math.min(typeof input.pollIntervalMs === "number" ? input.pollIntervalMs : 1000, 10000));
      const deadline = Date.now() + timeoutMs;
      while (outputPath && !existsSync(outputPath) && Date.now() < deadline) {
        await sleep(pollIntervalMs);
      }
      const finalized = await finalizeExportStatus(context, input, statusRecord?.status);
      return finalized;
    }
  },
  {
    name: "premiere.describe_subtitle_artifacts",
    description: "Write the multilingual subtitle artifact schema and expected language outputs.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        languages: { type: "array" },
        sourceLanguage: { type: "string" }
      },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const languages = Array.isArray(input.languages) ? input.languages.map(String) : ["en", "ja"];
      const schema = {
        schema: "creative.pipeline.multilingual_subtitles.v1",
        source: path,
        sourceLanguage: typeof input.sourceLanguage === "string" ? input.sourceLanguage : "auto",
        languages,
        artifacts: languages.map((language) => ({
          language,
          srt: `${parse(basename(path)).name}.${language}.srt`,
          vtt: `${parse(basename(path)).name}.${language}.vtt`,
          qc: `${parse(basename(path)).name}.${language}.subtitle_qc.json`
        })),
        requiredQc: ["timing_validation", "overlap", "reading_speed", "cleanup"]
      };
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_subtitle_artifact_schema.json"), schema);
      return { ok: true, message: "Multilingual subtitle artifact schema written", artifacts: [artifact], data: schema };
    }
  },
  {
    name: "premiere.create_multilanguage_subtitles",
    description: "Create subtitle translation job manifests for multiple languages.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, languages: { type: "array" } },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const languages = Array.isArray(input.languages) ? input.languages : ["en", "ja"];
      const manifest = {
        schema: "creative.pipeline.multilingual_subtitles.v1",
        source: path,
        languages,
        artifacts: languages.map((language) => ({
          language: String(language),
          srt: `${parse(basename(path)).name}.${String(language)}.srt`,
          vtt: `${parse(basename(path)).name}.${String(language)}.vtt`,
          qc: `${parse(basename(path)).name}.${String(language)}.subtitle_qc.json`
        })),
        adapters: ["WhisperX", "translation_provider", "caption_cleanup", "caption_overlap_qc", "caption_reading_speed_qc"]
      };
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_multilanguage_subtitles.json"), manifest);
      return { ok: true, message: "Multilanguage subtitle manifest written", artifacts: [artifact], data: manifest };
    }
  },
  {
    name: "premiere.generate_thumbnail_plan",
    description: "Create an automated thumbnail generation plan from the edit and brand package.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, count: { type: "number" } },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const count = typeof input.count === "number" ? input.count : 3;
      const thumbnail = await context.artifactStore.writeBytes(premiereArtifactName(path, "_thumbnail_1.png"), new Uint8Array());
      const extracted = await extractThumbnail(path, thumbnail);
      const plan = {
        source: path,
        count,
        extractedThumbnail: extracted.available ? thumbnail : null,
        extraction: extracted,
        candidates: Array.from({ length: count }, (_, index) => ({
          name: `thumbnail_variant_${index + 1}`,
          source: "scene_still_or_generated_background",
          qc: ["face_safe_area", "text_fit", "contrast", "brand_compliance"]
        }))
      };
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_thumbnail_plan.json"), plan);
      return { ok: true, message: "Thumbnail plan written", artifacts: [artifact], data: plan };
    }
  },
  {
    name: "premiere.repurpose_podcast",
    description: "Create a podcast/video repurposing plan with speaker-aware clips and social variants.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, targetDuration: { type: "number" } },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const plan = {
        source: path,
        targetDuration: typeof input.targetDuration === "number" ? input.targetDuration : 60,
        adapters: ["WhisperX diarization", "PySceneDetect", "OpenTimelineIO"],
        outputs: ["clip_plan.json", "rough_cut.otio", "captions.srt", "social_variants.json"]
      };
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_podcast_repurpose_plan.json"), plan);
      return { ok: true, message: "Podcast repurposing plan written", artifacts: [artifact], data: plan };
    }
  },
  {
    name: "premiere.fix_qc_issues",
    description: "Create a remediation plan for failed or warning delivery QC checks.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const report = await mediaQcReport(path, input);
      const plan = {
        source: path,
        fixes: report.checks
          .filter((check) => check.status === "warn" || check.status === "fail")
          .map((check) => ({ check: check.id, action: `route_to_adapter_for_${check.id.replaceAll(".", "_")}` }))
      };
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_qc_fix_plan.json"), plan);
      return { ok: true, message: "Delivery QC fix plan written", artifacts: [artifact], data: plan };
    }
  }
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCepCommandType(value: unknown): value is PremiereCepCommandType {
  return typeof value === "string" && cepCommandTypes.includes(value as PremiereCepCommandType);
}

async function assertOptionalAnchorPath(context: ToolExecutionContext, input: Record<string, unknown>): Promise<void> {
  if (typeof input.path !== "string") {
    return;
  }
  const path = requireMediaPath(input);
  await context.artifactStore.assertReadableFile(path);
}

async function assertReadableInputPath(context: ToolExecutionContext, value: unknown, field: string): Promise<string> {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  const path = value.trim();
  await context.artifactStore.assertReadableFile(path);
  return path;
}

function typedEditPayload(input: Record<string, unknown>, commandType: PremiereCepCommandType, operation: Record<string, unknown>) {
  return {
    schema: "creative.pipeline.premiere.typed_edit.v1",
    schemaVersion: 1,
    commandType,
    sequenceName: typeof input.sequenceName === "string" ? input.sequenceName : undefined,
    target: {
      trackType: input.trackType === "audio" ? "audio" : "video",
      trackIndex: numberOrUndefined(input.trackIndex) ?? 0,
      clipIndex: numberOrUndefined(input.clipIndex) ?? 0,
      clipName: typeof input.clipName === "string" ? input.clipName : undefined
    },
    operation,
    hostCapability: {
      bridge: "premiere_cep",
      minSchema: "creative.pipeline.premiere.status.v1",
      rawScriptProxy: false
    },
    bridge: "external_premiere_cep_required"
  };
}

function editCommandOptions(input: Record<string, unknown>, expectedSideEffects: string[]) {
  return {
    idempotencyKey: typeof input.idempotencyKey === "string" && input.idempotencyKey.trim() ? input.idempotencyKey.trim() : undefined,
    expectedSideEffects,
    requiresApproval: true,
    rollbackHint: typeof input.rollbackHint === "string" && input.rollbackHint.trim()
      ? input.rollbackHint.trim()
      : "Undo in Premiere, restore the previous project save, or re-run the prior approved timeline command."
  };
}

function typedEditResult(
  message: string,
  artifact: string,
  commandPath: string,
  manifest: Record<string, unknown>,
  command: unknown
): ToolResult {
  return {
    ok: true,
    message,
    artifacts: [artifact, commandPath],
    data: { manifest, command }
  };
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function adapterMissingError(adapter: string, message: string) {
  return structuredToolError(
    STRUCTURED_TOOL_ERROR_CODES.adapterMissing,
    message,
    { adapter }
  );
}

function buildBrandPackage(path: string, brand: unknown) {
  const value = brand && typeof brand === "object" ? brand as Record<string, unknown> : {};
  const colors = value.colors && typeof value.colors === "object"
    ? value.colors
    : {
        primary: typeof value.primaryColor === "string" ? value.primaryColor : "#ffffff",
        secondary: typeof value.secondaryColor === "string" ? value.secondaryColor : "#111111",
        accent: typeof value.accentColor === "string" ? value.accentColor : "#2f80ed"
      };
  const typography = value.typography && typeof value.typography === "object"
    ? value.typography
    : {
        fontFamily: typeof value.fontFamily === "string" ? value.fontFamily : "Inter",
        titleWeight: "bold",
        captionWeight: "semibold"
      };
  const captionStyle = value.captionStyle && typeof value.captionStyle === "object"
    ? value.captionStyle
    : {
        position: "bottom_safe",
        maxLines: 2,
        background: "semi_transparent",
        textColor: (colors as Record<string, unknown>).primary ?? "#ffffff",
        outlineColor: (colors as Record<string, unknown>).secondary ?? "#111111"
      };
  return {
    schema: "creative.pipeline.brand_package.v1",
    source: path,
    brand: value,
    colors,
    typography,
    captionStyle,
    lowerThirdStyle: value.lowerThirdStyle ?? { position: "lower_left", includeLogo: true },
    safeMargins: value.safeMargins ?? { titleSafe: 0.9, actionSafe: 0.95, captionBottomClearance: 0.14 },
    appliesTo: ["captions", "lower_thirds", "thumbnail", "end_card"],
    bridge: "external_premiere_cep_required"
  };
}

function buildTimelineMarkers(input: Record<string, unknown>) {
  const markers: Array<Record<string, unknown>> = [];
  if (input.intro && typeof input.intro === "object") {
    const intro = input.intro as Record<string, unknown>;
    markers.push({
      name: "intro",
      kind: "intro",
      startSeconds: typeof intro.startSeconds === "number" ? intro.startSeconds : 0,
      endSeconds: typeof intro.endSeconds === "number" ? intro.endSeconds : 5
    });
  }
  if (input.outro && typeof input.outro === "object") {
    const outro = input.outro as Record<string, unknown>;
    markers.push({
      name: "outro",
      kind: "outro",
      startSeconds: typeof outro.startSeconds === "number" ? outro.startSeconds : 55,
      endSeconds: typeof outro.endSeconds === "number" ? outro.endSeconds : 60
    });
  }
  if (Array.isArray(input.markers)) {
    markers.push(...(input.markers.filter((marker) => marker && typeof marker === "object") as Array<Record<string, unknown>>));
  }
  if (!markers.some((marker) => marker.kind === "safe_margin")) {
    markers.push({ name: "safe margins", kind: "safe_margin", startSeconds: 0 });
  }
  return markers;
}

function subtitleFormat(path: string, requested: unknown): "srt" | "vtt" {
  if (requested === "vtt") {
    return "vtt";
  }
  if (requested === "srt") {
    return "srt";
  }
  return extname(path).toLowerCase() === ".vtt" ? "vtt" : "srt";
}

async function subtitleValidation(path: string, requested: unknown) {
  const text = await readFile(path, "utf8");
  return validateCaptionCues(parseSubtitle(text, subtitleFormat(path, requested)));
}

async function finalizeExportStatus(
  context: ToolExecutionContext,
  input: Record<string, unknown>,
  status?: PremiereCepStatus
): Promise<ToolResult> {
  const outputPath = resolveExportOutputPath(input, status);
  if (!outputPath) {
    const pending = await context.artifactStore.writeJson("premiere/export_qc_pending.json", {
      commandId: input.commandId ?? null,
      status: status ?? null,
      reason: "missing_output_path"
    });
    return {
      ok: false,
      message: "Export QC pending: outputPath is missing",
      artifacts: [pending],
      data: { status: status ?? null }
    };
  }
  if (!existsSync(outputPath)) {
    const pending = await context.artifactStore.writeJson(premiereArtifactName(outputPath, "_export_qc_pending.json"), {
      commandId: input.commandId ?? null,
      outputPath,
      status: status ?? null,
      reason: "output_file_not_found"
    });
    return {
      ok: false,
      message: "Export QC pending: output file not found",
      artifacts: [pending],
      data: { outputPath, status: status ?? null }
    };
  }
  await context.artifactStore.assertReadableFile(outputPath);
  if (typeof input.captionPath === "string") {
    await context.artifactStore.assertReadableFile(input.captionPath);
  }
  if (typeof input.referencePath === "string") {
    await context.artifactStore.assertReadableFile(input.referencePath);
  }
  if (typeof input.modelPath === "string") {
    await context.artifactStore.assertReadableFile(input.modelPath);
  }
  const vmafLogPath = `${context.artifactStore.root}/premiere/${parse(basename(outputPath)).name}_export_vmaf_log.json`;
  const report = await mediaQcReport(outputPath, {
    ...input,
    vmafLogPath
  });
  const artifact = await context.artifactStore.writeJson(premiereArtifactName(outputPath, "_export_delivery_qc_report.json"), {
    cepStatus: status ?? null,
    report
  });
  const artifacts = existsSync(vmafLogPath) ? [artifact, vmafLogPath] : [artifact];
  return {
    ok: report.summary.status !== "fail",
    message: `Export delivery QC report written: ${report.summary.status}`,
    artifacts,
    data: { status: status ?? null, report }
  };
}

type ProjectTemplate = "youtube_shorts" | "youtube_16x9" | "podcast_clip" | "course_lesson" | "ad_creative";

const projectTemplates: Record<ProjectTemplate, {
  label: string;
  width: number;
  height: number;
  defaultDuration: number;
  preset: "1080x1920_h264_social" | "1920x1080_h264" | "1080x1080_h264";
  targetLufs: number;
  safeAreas: string[];
  brandTargets: string[];
}> = {
  youtube_shorts: {
    label: "YouTube Shorts",
    width: 1080,
    height: 1920,
    defaultDuration: 60,
    preset: "1080x1920_h264_social",
    targetLufs: -14,
    safeAreas: ["center_caption", "bottom_ui_clear", "top_title_clear"],
    brandTargets: ["captions", "thumbnail", "end_card"]
  },
  youtube_16x9: {
    label: "YouTube 16x9",
    width: 1920,
    height: 1080,
    defaultDuration: 600,
    preset: "1920x1080_h264",
    targetLufs: -14,
    safeAreas: ["lower_third", "title_safe", "end_card"],
    brandTargets: ["captions", "lower_thirds", "thumbnail", "end_card"]
  },
  podcast_clip: {
    label: "Podcast Clip",
    width: 1080,
    height: 1920,
    defaultDuration: 90,
    preset: "1080x1920_h264_social",
    targetLufs: -16,
    safeAreas: ["speaker_frame", "caption_stack", "waveform_strip"],
    brandTargets: ["captions", "speaker_labels", "thumbnail"]
  },
  course_lesson: {
    label: "Course Lesson",
    width: 1920,
    height: 1080,
    defaultDuration: 900,
    preset: "1920x1080_h264",
    targetLufs: -16,
    safeAreas: ["slide_region", "caption_band", "chapter_marker"],
    brandTargets: ["captions", "chapter_cards", "lower_thirds"]
  },
  ad_creative: {
    label: "Ad Creative",
    width: 1080,
    height: 1080,
    defaultDuration: 30,
    preset: "1080x1080_h264",
    targetLufs: -14,
    safeAreas: ["product_center", "cta_band", "logo_clear"],
    brandTargets: ["captions", "cta", "logo", "thumbnail"]
  }
};

function isProjectTemplate(value: unknown): value is ProjectTemplate {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(projectTemplates, value);
}

function resolveExportOutputPath(input: Record<string, unknown>, status?: PremiereCepStatus): string | undefined {
  if (typeof input.outputPath === "string" && input.outputPath) {
    return input.outputPath;
  }
  if (status?.details && typeof status.details.outputPath === "string" && status.details.outputPath) {
    return status.details.outputPath;
  }
  if (status?.command?.payload && typeof status.command.payload.outputPath === "string" && status.command.payload.outputPath) {
    return status.command.payload.outputPath;
  }
  return undefined;
}
