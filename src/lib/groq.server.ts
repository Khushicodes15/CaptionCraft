/** Server-only Groq provider. Swappable: implement TranscriptionProvider elsewhere. */
import type { Caption } from "@/modules/styles/types";

const GROQ_BASE = "https://api.groq.com/openai/v1";

export type TranscribeOptions = {
  audio: Uint8Array;
  language: string;
  offsetMs: number;
};

export type TranscriptionProvider = {
  transcribe(opts: TranscribeOptions): Promise<Caption[]>;
};

export class RateLimitedError extends Error {
  constructor(message = "Transcription service is busy. Please wait a moment and try again.") {
    super(message);
    this.name = "RateLimitedError";
  }
}

function apiKey(): string {
  const key = process.env["GROQ_API_KEY"];
  if (!key) throw new Error("Transcription is not configured yet (missing GROQ_API_KEY).");
  return key;
}

const HINDI_MIXED_PROMPT =
  "आज हम machine learning और AI के बारे में बात करेंगे। This ensures the model preserves English words in Latin script and Hindi words in Devanagari naturally.";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function groqTranscribe(model: string, opts: TranscribeOptions): Promise<Response> {
  const form = new FormData();
  form.append("file", new Blob([opts.audio as BlobPart], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", model);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  if (opts.language === "en") form.append("language", "en");
  if (opts.language === "hi" || opts.language === "hinglish") {
    form.append("language", "hi");
    form.append("prompt", HINDI_MIXED_PROMPT);
  }
  return fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
}

type VerboseJson = {
  words?: { word: string; start: number; end: number }[];
  segments?: { text: string; start: number; end: number }[];
  text?: string;
};

function toCaptions(payload: VerboseJson, offsetMs: number): Caption[] {
  if (payload.words?.length) {
    return payload.words.map((w) => ({
      text: w.word.trim(),
      startMs: Math.round(w.start * 1000 + offsetMs),
      endMs: Math.round(w.end * 1000 + offsetMs),
      timestampMs: Math.round(((w.start + w.end) / 2) * 1000 + offsetMs),
      confidence: null,
    }));
  }
  // Fallback: spread segment text evenly across its duration.
  const captions: Caption[] = [];
  for (const seg of payload.segments ?? []) {
    const words = seg.text.trim().split(/\s+/).filter(Boolean);
    const span = (seg.end - seg.start) / Math.max(1, words.length);
    words.forEach((word, i) => {
      const start = seg.start + i * span;
      captions.push({
        text: word,
        startMs: Math.round(start * 1000 + offsetMs),
        endMs: Math.round((start + span) * 1000 + offsetMs),
        timestampMs: Math.round((start + span / 2) * 1000 + offsetMs),
        confidence: null,
      });
    });
  }
  return captions;
}

export const groqProvider: TranscriptionProvider = {
  async transcribe(opts) {
    const models = ["whisper-large-v3", "whisper-large-v3-turbo"];
    let lastError: Error = new Error("Transcription failed.");

    for (const model of models) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await groqTranscribe(model, opts);
        if (response.ok) {
          const payload = (await response.json()) as VerboseJson;
          let captions = toCaptions(payload, opts.offsetMs);
          
          if (opts.language === "hinglish") {
            const { transliterateToRoman, hasDevanagari } = await import("@/modules/transcribe/hinglish");
            captions = captions.map(c => ({
              ...c,
              text: hasDevanagari(c.text) ? transliterateToRoman(c.text) : c.text,
            })).filter(c => c.text.trim().length > 0);
          }
          return captions;
        }
        const body = await response.text();
        if (response.status === 429) {
          lastError = new RateLimitedError();
          if (attempt === 2) break; // try the next model
          await sleep(1500 * 2 ** attempt);
          continue;
        }
        if (response.status >= 500) {
          lastError = new Error("Transcription service is temporarily unavailable.");
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new Error(`Transcription failed: ${body.slice(0, 200)}`);
      }
    }
    throw lastError;
  },
};

export async function groqChatJson(prompt: string, system: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (response.ok) {
      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content ?? "{}";
      return JSON.parse(content);
    }
    if (response.status === 429 || response.status >= 500) {
      await sleep(1200 * 2 ** attempt);
      continue;
    }
    throw new Error(`Emphasis detection failed (${response.status}).`);
  }
  throw new RateLimitedError("Catchy-word detection is rate limited. Using the local fallback.");
}

