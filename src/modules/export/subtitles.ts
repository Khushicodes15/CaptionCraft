import type { Caption } from "@/modules/styles/types";

export type SubtitleLine = { text: string; startMs: number; endMs: number };

/** Group words into subtitle lines of at most `wordsPerLine` words. */
export function toLines(captions: Caption[], wordsPerLine: number): SubtitleLine[] {
  const lines: SubtitleLine[] = [];
  for (let i = 0; i < captions.length; i += wordsPerLine) {
    const group = captions.slice(i, i + wordsPerLine);
    if (group.length === 0) continue;
    lines.push({
      text: group.map((c) => c.text).join(" "),
      startMs: group[0]!.startMs,
      endMs: group[group.length - 1]!.endMs,
    });
  }
  return lines;
}

function stamp(ms: number, comma: boolean): string {
  const total = Math.max(0, Math.round(ms));
  const h = String(Math.floor(total / 3_600_000)).padStart(2, "0");
  const m = String(Math.floor((total % 3_600_000) / 60_000)).padStart(2, "0");
  const s = String(Math.floor((total % 60_000) / 1000)).padStart(2, "0");
  const msPart = String(total % 1000).padStart(3, "0");
  return `${h}:${m}:${s}${comma ? "," : "."}${msPart}`;
}

export function toSrt(captions: Caption[], wordsPerLine: number): string {
  return toLines(captions, wordsPerLine)
    .map(
      (line, i) =>
        `${i + 1}\n${stamp(line.startMs, true)} --> ${stamp(line.endMs, true)}\n${line.text}\n`,
    )
    .join("\n");
}

export function toVtt(captions: Caption[], wordsPerLine: number): string {
  const body = toLines(captions, wordsPerLine)
    .map((line) => `${stamp(line.startMs, false)} --> ${stamp(line.endMs, false)}\n${line.text}\n`)
    .join("\n");
  return `WEBVTT\n\n${body}`;
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
