import { existsSync } from "node:fs";
import { basename, parse } from "node:path";
import type { QcCheck } from "@creative-pipeline-mcp/core";
import { buildQcReport, sha256File } from "@creative-pipeline-mcp/core";
import { probeMedia } from "../adapters/ffprobe.js";

export function requireMediaPath(input: Record<string, unknown>): string {
  const path = input.path ?? input.mediaPath ?? input.sourcePath;
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("Expected path, mediaPath, or sourcePath");
  }
  if (!existsSync(path)) {
    throw new Error(`Media not found: ${path}`);
  }
  return path;
}

export function premiereArtifactName(path: string, suffix: string): string {
  const parsed = parse(basename(path));
  return `premiere/${parsed.name}${suffix}`;
}

export async function mediaQcReport(path: string, options: Record<string, unknown> = {}) {
  const targetWidth = typeof options.targetWidth === "number" ? options.targetWidth : undefined;
  const targetHeight = typeof options.targetHeight === "number" ? options.targetHeight : undefined;
  const maxDuration = typeof options.maxDuration === "number" ? options.maxDuration : undefined;
  const probe = await probeMedia(path);
  const checks: QcCheck[] = [
    {
      id: "probe.ffprobe_available",
      status: probe.available ? "pass" : "warn",
      message: probe.available ? "ffprobe metadata captured" : `ffprobe unavailable: ${probe.error ?? "unknown"}`,
      value: probe.available
    },
    {
      id: "video.stream_present",
      status: probe.video ? "pass" : "fail",
      message: probe.video ? "Video stream found" : "Video stream missing",
      value: probe.video ?? null
    },
    {
      id: "audio.stream_present",
      status: probe.audio ? "pass" : "warn",
      message: probe.audio ? "Audio stream found" : "Audio stream missing",
      value: probe.audio ?? null
    },
    {
      id: "delivery.resolution",
      status:
        !targetWidth || !targetHeight || !probe.video
          ? "not_applicable"
          : probe.video.width === targetWidth && probe.video.height === targetHeight
            ? "pass"
            : "warn",
      message:
        probe.video && targetWidth && targetHeight
          ? `${probe.video.width}x${probe.video.height}; target ${targetWidth}x${targetHeight}`
          : "No target resolution supplied",
      value: probe.video ? { width: probe.video.width, height: probe.video.height } : null
    },
    {
      id: "delivery.duration",
      status:
        !maxDuration || !probe.format?.duration
          ? "not_applicable"
          : probe.format.duration <= maxDuration
            ? "pass"
            : "warn",
      message:
        probe.format?.duration && maxDuration
          ? `${probe.format.duration}s; max ${maxDuration}s`
          : "No max duration supplied",
      value: probe.format?.duration ?? null
    },
    {
      id: "audio.loudness",
      status: "warn",
      message: "Integrated LUFS requires pyloudnorm or ffmpeg loudnorm pass; adapter is optional",
      value: "external_adapter_required"
    },
    {
      id: "video.black_frames",
      status: "warn",
      message: "Black frame detection requires ffmpeg blackdetect pass; adapter is optional",
      value: "external_adapter_required"
    },
    {
      id: "captions.overlap",
      status: "not_applicable",
      message: "No caption file supplied for overlap validation",
      value: null
    }
  ];
  return buildQcReport("media", path, checks, { sha256: await sha256File(path), probe });
}

