import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Caption } from "@/modules/styles/types";

const transcribeInput = z.object({
  audioBase64: z.string().min(1),
  offsetMs: z.number().min(0),
  language: z.enum(["en", "hi", "hinglish"]),
  validStartMs: z.number().optional(),
  validEndMs: z.number().optional(),
  durationMs: z.number().optional(),
});

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const transcribeChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => transcribeInput.parse(data))
  .handler(async ({ data }): Promise<any> => {
    const audioBytes = base64ToBytes(data.audioBase64);
    let captions: Caption[] = [];

    if (data.language === "en") {
      const { groqProvider } = await import("./groq.server");
      captions = await groqProvider.transcribe({
        audio: audioBytes,
        language: "en",
        offsetMs: data.offsetMs,
      });
    } else {
      const { sarvamProvider } = await import("./sarvam.server");
      captions = await sarvamProvider.transcribe(
        {
          audio: audioBytes,
          language: data.language,
          offsetMs: data.offsetMs,
        },
        data.durationMs ?? 25000,
        data.audioBase64
      );
    }

    // Filter to valid time window (for chunk overlap deduplication)
    const cleaned = captions
      .filter((c) => {
        const t = c.timestampMs ?? (c.startMs + c.endMs) / 2;
        if (data.validStartMs !== undefined && t < data.validStartMs) return false;
        if (data.validEndMs !== undefined && t >= data.validEndMs) return false;
        return true;
      })
      .filter((caption) => caption.text.trim().length > 0);

    return { captions: cleaned };
  });

const emphasisInput = z.object({ words: z.array(z.string()).min(1).max(4000) });

const emphasisResponse = z.object({
  emphasis: z.array(
    z.object({ index: z.number().int().min(0), level: z.number().int().min(1).max(3) }),
  ),
});

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "to", "of", "and", "in", "on", "it", "this", "that", "for", "with", "as", "by", "at", "from", "but", "not", "be", "or", "so", "if", "they", "we", "you", "i", "he", "she",
  "hai", "hain", "ka", "ki", "ke", "ko", "ye", "yeh", "wo", "woh", "aur", "toh", "se", "me", "mein", "ne", "par", "pe", "ho", "tha", "thi", "na", "bhi", "kya", "jo", "hum", "tum", "aap", "un", "unka",
]);

const POWER_WORDS = new Set([
  "never", "always", "best", "worst", "free", "secret", "huge", "massive", "instantly", "money", "growth", "win", "lose", "fail", "boom", "crazy", "insane", "love", "hate",
  "paisa", "mast", "jugaad", "zabardast", "bindaas", "dhamaal", "kamaal", "faayda",
]);

function isStopword(word: string): boolean {
  const clean = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  return STOPWORDS.has(clean);
}

export function localEmphasis(words: string[]): { index: number; level: 1 | 2 | 3 }[] {
  const out: { index: number; level: 1 | 2 | 3 }[] = [];
  words.forEach((raw, index) => {
    if (isStopword(raw)) return;
    const word = raw.toLowerCase().replace(/[^a-z0-9%$]/g, "");
    if (!word) return;
    if (/[$]|^\d+[%]?$/.test(word)) out.push({ index, level: 3 });
    else if (POWER_WORDS.has(word)) out.push({ index, level: 2 });
    else if (word.length > 8) out.push({ index, level: 1 });
  });
  return out;
}

function postFilterEmphasis(
  emphasis: { index: number; level: number }[],
  words: string[],
): { index: number; level: 1 | 2 | 3 }[] {
  const filtered = emphasis.filter(
    (e) => e.index < words.length && e.level >= 1 && e.level <= 3 && !isStopword(words[e.index]!),
  ) as { index: number; level: 1 | 2 | 3 }[];

  filtered.sort((a, b) => b.level - a.level || a.index - b.index);

  const maxAllowed = Math.max(1, Math.round(words.length * 0.2));
  const windowSize = 4;
  const accepted: typeof filtered = [];

  for (const e of filtered) {
    if (accepted.length >= maxAllowed) break;
    const windowStart = Math.floor(e.index / windowSize) * windowSize;
    const windowEnd = windowStart + windowSize;
    const inWindow = accepted.filter((a) => a.index >= windowStart && a.index < windowEnd).length;
    if (inWindow < 2) {
      accepted.push(e);
    }
  }

  if (accepted.length === 0 && words.length >= 5) {
    let bestIndex = -1;
    let maxLength = 0;
    for (let i = 0; i < words.length; i++) {
      if (!isStopword(words[i]!)) {
        const clean = words[i]!.replace(/[^a-zA-Z0-9]/g, "");
        if (clean.length > maxLength) {
          maxLength = clean.length;
          bestIndex = i;
        }
      }
    }
    if (bestIndex !== -1) {
      accepted.push({ index: bestIndex, level: 1 });
    }
  }

  return accepted.sort((a, b) => a.index - b.index);
}

export const detectEmphasis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => emphasisInput.parse(data))
  .handler(
    async ({
      data,
    }): Promise<{ emphasis: { index: number; level: number }[]; source: "ai" | "local" }> => {
      let rawEmphasis: { index: number; level: number }[] = [];
      let source: "ai" | "local" = "ai";

      try {
        const { groqChatJson } = await import("./groq.server");
        const raw = await groqChatJson(
          JSON.stringify({ words: data.words.map((w, i) => ({ i, w })) }),
          [
            "You mark catchy words in a spoken transcript for animated captions.",
            "Rules:",
            "1. NEVER emphasize stopwords (the, a, is, hai, ki, se, etc.).",
            "2. Pick 10-20% of words: nouns, numbers, money, power verbs, brand names, strong adjectives, Hinglish slang.",
            "3. Max 1-2 words emphasized per short sentence.",
            'Reply with STRICT JSON only: {"emphasis":[{"index":0,"level":1}]} where level is 1-3.',
          ].join(" "),
        );
        const parsed = emphasisResponse.parse(raw);
        rawEmphasis = parsed.emphasis;
      } catch (error) {
        console.error("AI Emphasis failed, using local fallback", error);
        rawEmphasis = localEmphasis(data.words);
        source = "local";
      }

      return {
        emphasis: postFilterEmphasis(rawEmphasis, data.words),
        source,
      };
    },
  );