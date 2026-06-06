import { basename, parse } from "node:path";
import type { ToolDefinition } from "@creative-pipeline-mcp/core";
import { mediaQcReport, premiereArtifactName, requireMediaPath } from "./shared.js";
import { probeMedia } from "../adapters/ffprobe.js";
import { extractThumbnail } from "../adapters/ffmpegQc.js";
import { enqueuePremiereCommand } from "../adapters/premiereCep.js";
import { runPyloudnormAdapter, runSceneDetectAdapter, runWhisperAdapter } from "../adapters/optionalTools.js";

export const premiereTools: ToolDefinition[] = [
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
        captionPath: { type: "string" }
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
      const report = await mediaQcReport(path, input);
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_delivery_qc_report.json"), report);
      return {
        ok: report.summary.status !== "fail",
        message: `Delivery QC report written: ${report.summary.status}`,
        artifacts: [artifact],
        data: report as unknown as Record<string, unknown>
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
        brief: { type: "string" },
        targetDuration: { type: "number" }
      },
      required: ["path"],
      additionalProperties: true
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
    name: "premiere.auto_caption",
    description: "Create an SRT caption file from supplied transcript text, or a placeholder when ASR is not configured.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        transcript: { type: "string" }
      },
      required: ["path"],
      additionalProperties: true
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
        preset: { type: "string" }
      },
      required: ["path"],
      additionalProperties: true
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const plan = {
        source: path,
        preset: String(input.preset ?? "1080x1920_h264_social"),
        bridge: "external_premiere_cep_required",
        requiresApproval: true,
        output: `exports/${parse(basename(path)).name}_final.mp4`
      };
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_export_plan.json"), plan);
      return { ok: true, message: "Export plan written", artifacts: [artifact], data: plan };
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
      additionalProperties: true
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
    description: "Create a brand package application manifest for captions, colors, fonts, and graphics.",
    category: "premiere",
    risk: "safe_write",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, brand: { type: "object" } },
      required: ["path"],
      additionalProperties: true
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const manifest = {
        source: path,
        brand: input.brand ?? {},
        appliesTo: ["captions", "lower_thirds", "thumbnail", "end_card"],
        bridge: "external_premiere_cep_required"
      };
      const artifact = await context.artifactStore.writeJson(premiereArtifactName(path, "_brand_package.json"), manifest);
      return { ok: true, message: "Brand package manifest written", artifacts: [artifact], data: manifest };
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
      additionalProperties: true
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const languages = Array.isArray(input.languages) ? input.languages : ["en", "ja"];
      const manifest = {
        source: path,
        languages,
        outputs: languages.map((language) => `${parse(basename(path)).name}.${String(language)}.srt`),
        adapters: ["WhisperX", "translation_provider", "caption_overlap_qc"]
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
      additionalProperties: true
    },
    async execute(context, input) {
      const path = requireMediaPath(input);
      await context.artifactStore.assertReadableFile(path);
      const count = typeof input.count === "number" ? input.count : 3;
      const thumbnail = await context.artifactStore.writeBytes(premiereArtifactName(path, "_thumbnail_1.jpg"), new Uint8Array());
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
      additionalProperties: true
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
