import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface MediaProbe {
  available: boolean;
  format?: {
    duration?: number;
    bitRate?: number;
    formatName?: string;
  };
  video?: {
    codec?: string;
    width?: number;
    height?: number;
    fps?: number;
    duration?: number;
    bitRate?: number;
  };
  audio?: {
    codec?: string;
    channels?: number;
    sampleRate?: number;
    duration?: number;
  };
  raw?: unknown;
  error?: string;
}

export async function probeMedia(path: string): Promise<MediaProbe> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      path
    ]);
    const raw = JSON.parse(stdout) as {
      format?: { duration?: string; bit_rate?: string; format_name?: string };
      streams?: Array<Record<string, unknown>>;
    };
    const videoStream = raw.streams?.find((stream) => stream.codec_type === "video");
    const audioStream = raw.streams?.find((stream) => stream.codec_type === "audio");
    return {
      available: true,
      format: {
        duration: numberFrom(raw.format?.duration),
        bitRate: numberFrom(raw.format?.bit_rate),
        formatName: raw.format?.format_name
      },
      video: videoStream
        ? {
            codec: stringFrom(videoStream.codec_name),
            width: numberFrom(videoStream.width),
            height: numberFrom(videoStream.height),
            fps: fpsFrom(stringFrom(videoStream.avg_frame_rate) ?? stringFrom(videoStream.r_frame_rate)),
            duration: numberFrom(videoStream.duration),
            bitRate: numberFrom(videoStream.bit_rate)
          }
        : undefined,
      audio: audioStream
        ? {
            codec: stringFrom(audioStream.codec_name),
            channels: numberFrom(audioStream.channels),
            sampleRate: numberFrom(audioStream.sample_rate),
            duration: numberFrom(audioStream.duration)
          }
        : undefined,
      raw
    };
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function numberFrom(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function fpsFrom(value: string | undefined): number | undefined {
  if (!value || value === "0/0") {
    return undefined;
  }
  const [left, right] = value.split("/").map(Number);
  if (!Number.isFinite(left) || !Number.isFinite(right) || right === 0) {
    return undefined;
  }
  return Math.round((left / right) * 1000) / 1000;
}

