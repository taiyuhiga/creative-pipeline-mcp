import { execFile } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface OptionalToolResult {
  available: boolean;
  command: string;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export async function optionalCommandExists(command: string): Promise<boolean> {
  const resolved = resolveOptionalCommand(command);
  if (command.includes("/") || command.includes("\\")) {
    try {
      await access(command, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await execFileAsync(process.platform === "win32" ? "where" : "command", process.platform === "win32" ? [resolved] : ["-v", resolved], {
      shell: process.platform !== "win32"
    });
    return true;
  } catch {
    return false;
  }
}

export async function runWhisperAdapter(mediaPath: string, outputDir: string): Promise<OptionalToolResult> {
  const command = resolveOptionalCommand(process.env.WHISPERX_BIN ?? "whisperx");
  if (!(await optionalCommandExists(process.env.WHISPERX_BIN ?? "whisperx"))) {
    return { available: false, command, error: "WhisperX CLI not found" };
  }
  await mkdir(outputDir, { recursive: true });
  return run(command, [mediaPath, "--output_dir", outputDir, "--output_format", "json"]);
}

export async function runSceneDetectAdapter(mediaPath: string, outputDir: string): Promise<OptionalToolResult> {
  const command = resolveOptionalCommand(process.env.SCENEDETECT_BIN ?? "scenedetect");
  if (!(await optionalCommandExists(process.env.SCENEDETECT_BIN ?? "scenedetect"))) {
    return { available: false, command, error: "PySceneDetect CLI not found" };
  }
  await mkdir(outputDir, { recursive: true });
  return run(command, ["-i", mediaPath, "detect-content", "list-scenes", "-o", outputDir]);
}

export async function runPyloudnormAdapter(mediaPath: string, outputPath: string): Promise<OptionalToolResult> {
  const python = resolveOptionalCommand(process.env.PYTHON_BIN ?? "python3");
  if (!(await optionalCommandExists(process.env.PYTHON_BIN ?? "python3"))) {
    return { available: false, command: python, error: "Python executable not found" };
  }
  await mkdir(dirname(outputPath), { recursive: true });
  const script = `
import json
import sys
try:
    import soundfile as sf
    import pyloudnorm as pyln
    data, rate = sf.read(${JSON.stringify(mediaPath)})
    meter = pyln.Meter(rate)
    loudness = meter.integrated_loudness(data)
    open(${JSON.stringify(outputPath)}, "w").write(json.dumps({"integrated_lufs": loudness}, indent=2))
except Exception as exc:
    open(${JSON.stringify(outputPath)}, "w").write(json.dumps({"error": str(exc)}, indent=2))
    sys.exit(2)
`;
  return run(python, ["-c", script]);
}

async function run(command: string, args: string[]): Promise<OptionalToolResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args);
    return { available: true, command, stdout, stderr };
  } catch (error) {
    return { available: true, command, error: error instanceof Error ? error.message : String(error) };
  }
}

function resolveOptionalCommand(command: string): string {
  if (command.includes("/") || command.includes("\\")) {
    return command;
  }
  const local = resolve("node_modules", ".bin", process.platform === "win32" ? `${command}.cmd` : command);
  return existsSync(local) ? local : command;
}

