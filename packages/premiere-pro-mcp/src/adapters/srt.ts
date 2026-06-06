export interface CaptionCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
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

function parseTimestamp(value: string | undefined): number {
  const match = value?.match(/^(\d+):(\d+):(\d+),(\d+)$/u);
  if (!match) {
    return Number.NaN;
  }
  const [, hours, minutes, seconds, millis] = match.map(Number);
  return (((hours * 60 + minutes) * 60 + seconds) * 1000) + millis;
}

