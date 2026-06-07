export interface CaptionCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface CaptionValidation {
  cueCount: number;
  overlaps: number;
  invalidTimings: number;
  emptyCues: number;
  maxCharsPerSecond: number;
  maxWordsPerMinute: number;
}

export function parseSrt(input: string): CaptionCue[] {
  return input
    .trim()
    .split(/\n\s*\n/u)
    .map((block) => block.split(/\r?\n/u))
    .map((lines) => {
      const index = Number(lines[0]);
      const timing = lines[1] ?? "";
      const [start, end] = timing.split(/\s+-->\s+/u);
      return {
        index,
        startMs: parseTimestamp(start),
        endMs: parseTimestamp(end),
        text: lines.slice(2).join("\n")
      };
    })
    .filter((cue) => Number.isFinite(cue.index) && Number.isFinite(cue.startMs) && Number.isFinite(cue.endMs));
}

export function parseVtt(input: string): CaptionCue[] {
  return input
    .replace(/^\uFEFF?WEBVTT[^\n]*(?:\r?\n)+/u, "")
    .trim()
    .split(/\n\s*\n/u)
    .map((block, index) => block.split(/\r?\n/u).filter((line) => line.trim() && !line.startsWith("NOTE")))
    .map((lines, index) => {
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      const timing = timingIndex >= 0 ? lines[timingIndex] : "";
      const [start, end] = timing.split(/\s+-->\s+/u);
      return {
        index: index + 1,
        startMs: parseTimestamp(start),
        endMs: parseTimestamp(end?.split(/\s+/u)[0]),
        text: lines.slice(timingIndex + 1).join("\n")
      };
    })
    .filter((cue) => Number.isFinite(cue.startMs) && Number.isFinite(cue.endMs));
}

export function parseSubtitle(input: string, format: "srt" | "vtt" = "srt"): CaptionCue[] {
  return format === "vtt" ? parseVtt(input) : parseSrt(input);
}

export function countCaptionOverlaps(cues: CaptionCue[]): number {
  let overlaps = 0;
  const sorted = [...cues].sort((a, b) => a.startMs - b.startMs);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index]!.startMs < sorted[index - 1]!.endMs) {
      overlaps += 1;
    }
  }
  return overlaps;
}

export function validateCaptionCues(cues: CaptionCue[]): CaptionValidation {
  let invalidTimings = 0;
  let emptyCues = 0;
  let maxCharsPerSecond = 0;
  let maxWordsPerMinute = 0;
  for (const cue of cues) {
    const durationSeconds = Math.max(0, (cue.endMs - cue.startMs) / 1000);
    const text = cue.text.replace(/\s+/gu, " ").trim();
    if (cue.endMs <= cue.startMs) {
      invalidTimings += 1;
    }
    if (!text) {
      emptyCues += 1;
    }
    if (durationSeconds > 0) {
      maxCharsPerSecond = Math.max(maxCharsPerSecond, text.length / durationSeconds);
      const words = text ? text.split(/\s+/u).length : 0;
      maxWordsPerMinute = Math.max(maxWordsPerMinute, (words / durationSeconds) * 60);
    }
  }
  return {
    cueCount: cues.length,
    overlaps: countCaptionOverlaps(cues),
    invalidTimings,
    emptyCues,
    maxCharsPerSecond,
    maxWordsPerMinute
  };
}

export function cleanupCaptionCues(cues: CaptionCue[], maxCharsPerLine = 42): CaptionCue[] {
  return cues
    .filter((cue) => cue.endMs > cue.startMs && cue.text.trim())
    .sort((a, b) => a.startMs - b.startMs)
    .map((cue, index, sorted) => {
      const next = sorted[index + 1];
      const endMs = next && cue.endMs > next.startMs ? Math.max(cue.startMs + 250, next.startMs - 1) : cue.endMs;
      return {
        index: index + 1,
        startMs: cue.startMs,
        endMs,
        text: wrapCaptionText(cue.text.replace(/\s+/gu, " ").trim(), maxCharsPerLine)
      };
    });
}

export function formatSrt(cues: CaptionCue[]): string {
  return `${cues.map((cue, index) => [
    String(index + 1),
    `${formatSrtTimestamp(cue.startMs)} --> ${formatSrtTimestamp(cue.endMs)}`,
    cue.text
  ].join("\n")).join("\n\n")}\n`;
}

export function formatVtt(cues: CaptionCue[]): string {
  return `WEBVTT\n\n${cues.map((cue) => [
    `${formatVttTimestamp(cue.startMs)} --> ${formatVttTimestamp(cue.endMs)}`,
    cue.text
  ].join("\n")).join("\n\n")}\n`;
}

function parseTimestamp(value: string | undefined): number {
  const match = value?.match(/^(\d+):(\d+):(\d+)[,.](\d+)$/u);
  if (!match) {
    return Number.NaN;
  }
  const [, hours, minutes, seconds, millis] = match.map(Number);
  return (((hours * 60 + minutes) * 60 + seconds) * 1000) + millis;
}

function formatSrtTimestamp(ms: number): string {
  return formatTimestamp(ms, ",");
}

function formatVttTimestamp(ms: number): string {
  return formatTimestamp(ms, ".");
}

function formatTimestamp(ms: number, separator: "," | "."): string {
  const safeMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(safeMs / 3600000);
  const minutes = Math.floor((safeMs % 3600000) / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const millis = safeMs % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${separator}${String(millis).padStart(3, "0")}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function wrapCaptionText(text: string, maxCharsPerLine: number): string {
  const words = text.split(/\s+/u);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.join("\n");
}
