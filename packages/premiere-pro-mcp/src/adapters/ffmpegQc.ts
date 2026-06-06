import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface FfmpegQcResult {
  available: boolean;
  blackFrames?: number;
  silenceEvents?: number;
  loudnessMeasured?: boolean;
  thumbnails?: string[];
  error?: string;
}

export async function runFfmpegQc(path: string): Promise<FfmpegQcResult> {
  try {
    const black = await execFileAsync("ffmpeg", ["-hide_banner", "-i", path, "-vf", "blackdetect=d=0.5:pix_th=0.10", "-an", "-f", "null", "-"]);
    const silence = await execFileAsync("ffmpeg", ["-hide_banner", "-i", path, "-af", "silencedetect=noise=-35dB:d=0.5", "-f", "null", "-"]);
    const loudness = await execFileAsync("ffmpeg", ["-hide_banner", "-i", path, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"]);
    return {
      available: true,
      blackFrames: countMatches(black.stderr, /black_start:/g),
      silenceEvents: countMatches(silence.stderr, /silence_start:/g),
      loudnessMeasured: /input_i|output_i/.test(loudness.stderr)
    };
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function extractThumbnail(path: string, outputPath: string, time = "00:00:00.100"): Promise<FfmpegQcResult> {
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await execFileAsync("ffmpeg", ["-hide_banner", "-y", "-ss", time, "-i", path, "-frames:v", "1", outputPath]);
    return { available: true, thumbnails: [outputPath] };
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}
