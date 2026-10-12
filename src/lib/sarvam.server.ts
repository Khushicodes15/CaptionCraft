/**
 * Server-only Sarvam AI provider for Hindi and Hinglish transcription.
 *
 * Pipeline:
 *  1. Sarvam saaras:v4:
 *     - For Hinglish: mode="translit" -> native Roman Hinglish preserving genuine English spellings.
 *     - For Hindi: mode="codemix" -> natural Hindi in Devanagari preserving English terms in Latin script.
 *  2. align.server.ts -> stable-ts forced alignment sidecar -> accurate word-level timestamps.
 *  3. Fallback: sentence distribution bounded by Sarvam's utterance timestamps (if aligner is unavailable).
 */

import type { Caption } from "@/modules/styles/types";
import { RateLimitedError } from "./groq.server";
import { hasDevanagari } from "@/modules/transcribe/hinglish";

const SARVAM_BASE = "https://api.sarvam.ai";

function apiKey(): string {
  const key = process.env["SARVAM_API_KEY"];
  if (!key) throw new Error("Transcription is not configured yet (missing SARVAM_API_KEY).");
  return key;
}

export type SarvamTranscribeOptions = {
  audio: Uint8Array;
  /** "hi" = Devanagari output, "hinglish" = Roman Hindi output */
  language: "hi" | "hinglish";
  offsetMs: number;
};

type SarvamResponse = {
  request_id?: string;
  transcript: string;
  language_code?: string;
  timestamps?: { words?: string[]; start_time_seconds?: number[]; end_time_seconds?: number[] };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Get accurate transcript from Sarvam Saaras v4 with mode tailored to code-mixing */
async function getSarvamTranscript(
  opts: SarvamTranscribeOptions,
): Promise<{ transcript: string; timestamps?: SarvamResponse["timestamps"] }> {
  const form = new FormData();
  form.append("file", new Blob([opts.audio as BlobPart], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", "saaras:v4");
  form.append("language_code", "hi-IN");

  // For Hinglish, use Sarvam's native translit mode which preserves standard English
  // spelling for English words and natural Roman for Hindi words.
  // For Hindi, use codemix mode which preserves English technical terms in Latin script
  // and Hindi words in Devanagari script.
  if (opts.language === "hinglish") {
    form.append("mode", "translit");
  } else {
    form.append("mode", "codemix");
  }
  form.append("with_timestamps", "true");

  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await fetch(SARVAM_BASE + "/speech-to-text", {
      method: "POST",
      headers: { "api-subscription-key": apiKey() },
      body: form,
    });

    if (resp.ok) {
      const buf = await resp.arrayBuffer();
      const rawText = new TextDecoder("utf-8").decode(buf);
      let payload: SarvamResponse;
      try {
        payload = JSON.parse(rawText);
      } catch (err) {
        console.error("[Sarvam] JSON parse error on raw text:", rawText.slice(0, 100));
        throw err;
      }
      const transcript = payload.transcript?.trim() ?? "";
      console.log(`[Sarvam] transcript (${opts.language}, mode=${opts.language === "hinglish" ? "translit" : "codemix"}):`, transcript.slice(0, 200));
      return { transcript, timestamps: payload.timestamps };
    }

    if (resp.status === 429) {
      if (attempt < 2) { await sleep(1500 * 2 ** attempt); continue; }
      throw new RateLimitedError();
    }
    if (resp.status >= 500) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }

    const body = await resp.text();
    throw new Error("Sarvam transcription failed: " + body.slice(0, 200));
  }
  throw new Error("Sarvam transcription failed after retries.");
}

/**
 * Fallback timing: distribute words within Sarvam's utterance timestamps if available,
 * or distribute across sentence boundaries using character-count weighting.
 */
function distributeBySentences(
  transcript: string,
  chunkStartSec: number,
  chunkEndSec: number,
  offsetMs: number,
  sarvamTimestamps?: SarvamResponse["timestamps"],
): Caption[] {
  // If Sarvam provided utterance start and end seconds, use them directly
  if (
    sarvamTimestamps?.words &&
    sarvamTimestamps.start_time_seconds &&
    sarvamTimestamps.end_time_seconds &&
    sarvamTimestamps.words.length > 0 &&
    sarvamTimestamps.words.length === sarvamTimestamps.start_time_seconds.length
  ) {
    const captions: Caption[] = [];
    for (let sIdx = 0; sIdx < sarvamTimestamps.words.length; sIdx++) {
      const sentenceText = sarvamTimestamps.words[sIdx]?.trim() || "";
      if (!sentenceText) continue;
      const sStart = sarvamTimestamps.start_time_seconds[sIdx] ?? chunkStartSec;
      const sEnd = sarvamTimestamps.end_time_seconds[sIdx] ?? chunkEndSec;
      const duration = Math.max(0.1, sEnd - sStart);
      const words = sentenceText.split(/\s+/).filter(Boolean);
      if (words.length === 0) continue;
      const spanPerWord = duration / words.length;
      words.forEach((w, wIdx) => {
        const wStart = sStart + wIdx * spanPerWord;
        const wEnd = sStart + (wIdx + 1) * spanPerWord;
        captions.push({
          text: w,
          startMs: Math.round(wStart * 1000 + offsetMs),
          endMs: Math.round(wEnd * 1000 + offsetMs),
          timestampMs: Math.round(((wStart + wEnd) / 2) * 1000 + offsetMs),
          confidence: null,
        });
      });
    }
    if (captions.length > 0) return captions;
  }

  // Fallback to newline-separated utterance distribution
  const sentences = transcript.split(/\n+/).map(s => s.trim()).filter(Boolean);
  if (sentences.length === 0) return [];

  const totalDuration = chunkEndSec - chunkStartSec;
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
  const captions: Caption[] = [];
  let cursorSec = chunkStartSec;

  for (const sentence of sentences) {
    const sentenceDuration = totalDuration * (sentence.length / totalChars);
    const sentenceEnd = cursorSec + sentenceDuration;
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length === 0) { cursorSec = sentenceEnd; continue; }

    const spanPerWord = sentenceDuration / words.length;
    words.forEach((word, i) => {
      const wStart = cursorSec + i * spanPerWord;
      const wEnd = cursorSec + (i + 1) * spanPerWord;
      captions.push({
        text: word,
        startMs: Math.round(wStart * 1000 + offsetMs),
        endMs: Math.round(wEnd * 1000 + offsetMs),
        timestampMs: Math.round(((wStart + wEnd) / 2) * 1000 + offsetMs),
        confidence: null,
      });
    });
    cursorSec = sentenceEnd;
  }
  return captions;
}

export const sarvamProvider = {
  async transcribe(
    opts: SarvamTranscribeOptions,
    chunkDurationMs: number = 25000,
    audioBase64?: string,
  ): Promise<Caption[]> {
    // Step 1: Accurate transcript from Sarvam
    const { transcript, timestamps: sarvamTimestamps } = await getSarvamTranscript(opts);
    if (!transcript) return [];

    // Step 2: Forced alignment via stable-ts Python sidecar
    let captions: Caption[] = [];
    let alignmentUsed = false;

    if (audioBase64) {
      try {
        const { alignWithWhisper, alignedWordsToCaptions } = await import("./align.server");
        // For Hinglish (Roman script) or predominantly Latin code-mix, Whisper aligns best with "en"
        const alignLang = opts.language === "hinglish" ? "en" : (hasDevanagari(transcript) ? "hi" : "en");
        const aligned = await alignWithWhisper(
          audioBase64,
          transcript,
          alignLang,
          opts.offsetMs,
        );

        if (aligned.length > 0) {
          captions = alignedWordsToCaptions(aligned);
          alignmentUsed = true;
          console.log(`[align] Word-level alignment: ${captions.length} words`);
        } else {
          console.warn("[align] No valid words returned from sidecar, using utterance distribution fallback");
        }
      } catch (e) {
        console.error("[align] Forced alignment failed, using utterance distribution fallback:", e instanceof Error ? e.message : e);
      }
    }

    // Fallback: sentence distribution using Sarvam's utterance timestamps
    if (!alignmentUsed) {
      console.warn("[align] FALLBACK: using utterance-proportional distribution");
      captions = distributeBySentences(
        transcript,
        0,
        chunkDurationMs / 1000,
        opts.offsetMs,
        sarvamTimestamps,
      );
    }

    // Step 3: For Hinglish — if any residual Devanagari words exist, transliterate them to Roman
    if (opts.language === "hinglish") {
      const { transliterateToRoman, hasDevanagari: checkDev } = await import("@/modules/transcribe/hinglish");
      captions = captions.map(c => ({
        ...c,
        text: checkDev(c.text) ? transliterateToRoman(c.text) : c.text,
      })).filter(c => c.text.trim().length > 0);
    }

    return captions;
  },
};