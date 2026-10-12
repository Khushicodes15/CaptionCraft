/**
 * Server-side forced alignment using stable-ts via Python child process.
 *
 * ALIGNMENT FIX: Whisper (even base) struggles heavily with cross-attention for 
 * Devanagari script. To achieve highly accurate word-level forced alignment, 
 * we transliterate the Devanagari transcript to Roman/Latin script, and tell 
 * Whisper to align it using English tokenization (which perfectly matches the 
 * phonetics). Then we map the timestamps back to the original Devanagari words.
 */

import { spawn } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import type { Caption } from "@/modules/styles/types";
import { hasDevanagari, transliterateToRoman } from "@/modules/transcribe/hinglish";

function resolvePythonExecutable(): string {
  const customBin = process.env["PYTHON_BIN"];
  if (customBin) {
    return customBin;
  }
  if (process.platform === "win32") {
    const defaultWinPython = "C:\\Users\\User\\AppData\\Local\\Programs\\Python\\Python311\\python.exe";
    if (existsSync(defaultWinPython)) {
      return defaultWinPython;
    }
    return "python";
  }
  return "python3";
}

const PYTHON_EXE = resolvePythonExecutable();
const ALIGN_SCRIPT = path.join(process.cwd(), "src", "lib", "align_whisper.py");

export type AlignedWord = { word: string; start_ms: number; end_ms: number };

export async function alignWithWhisper(
  audioBase64: string,
  originalTranscript: string,
  language: string,
  offsetMs: number,
): Promise<AlignedWord[]> {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const audioFile      = path.join(tmpdir(), `align_audio_${id}.mp3`);
  const transcriptFile = path.join(tmpdir(), `align_transcript_${id}.txt`);

  const isDevanagari = hasDevanagari(originalTranscript);
  // Write audio bytes to temp file
  const audioBytes = Buffer.from(audioBase64, "base64");
  writeFileSync(audioFile, audioBytes);
  // Write transcript as explicit UTF-8
  writeFileSync(transcriptFile, originalTranscript, { encoding: "utf8" });

  console.log(`[align.server] audio=${audioFile} (${audioBytes.length} bytes), transcript=${transcriptFile} (${Buffer.byteLength(originalTranscript, "utf8")} bytes), offsetMs=${offsetMs}, lang=${language}`);

  return new Promise((resolve) => {
    const args = [
      ALIGN_SCRIPT,
      "--audio_file",      audioFile,
      "--transcript_file", transcriptFile,
      "--language",        language,
      "--offset_ms",       String(offsetMs),
      "--model",           "base", // base is much better than tiny for alignment
    ];

    const proc = spawn(PYTHON_EXE, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString("utf8"); });

    const cleanup = () => {
      try { if (existsSync(audioFile))      unlinkSync(audioFile);      } catch {}
      try { if (existsSync(transcriptFile)) unlinkSync(transcriptFile); } catch {}
    };

    proc.on("close", (code) => {
      cleanup();

      // Forward all stderr lines as server logs
      stderr.split("\n").filter(l => l.trim()).forEach(line => {
        console.log(`[align.py]`, line);
      });

      if (code !== 0) {
        console.error(`[align.server] Python process exited with code ${code}`);
        return resolve([]);
      }

      try {
        const rawWords: AlignedWord[] = JSON.parse(stdout.trim());
        
        // Restore original casing/characters if aligning Devanagari
        if (isDevanagari && rawWords.length > 0) {
          const originalWords = originalTranscript.split(/\s+/).filter(Boolean);
          if (originalWords.length === rawWords.length) {
            for (let i = 0; i < rawWords.length; i++) {
              rawWords[i]!.word = originalWords[i]!; // restore Devanagari tokens
            }
          } else {
            console.warn(`[align.server] Mismatch in word count! Original: ${originalWords.length}, Aligned: ${rawWords.length}. Falling back to unmapped words.`);
          }
        }

        if (rawWords.length > 0) {
          console.log(`[align.server] SUCCESS: ${rawWords.length} words. First: ${JSON.stringify(rawWords[0])}, Last: ${JSON.stringify(rawWords[rawWords.length - 1])}`);
        } else {
          console.warn(`[align.server] SUCCESS but returned 0 words`);
        }
        
        resolve(rawWords);
      } catch (e) {
        console.error("[align.server] Failed to parse output:", e, "\nSTDOUT:", stdout);
        resolve([]);
      }
    });

    proc.on("error", (err) => {
      cleanup();
      console.error("[align.server] Failed to start python process:", err);
      resolve([]);
    });
  });
}

/** Converts array of raw aligned words into Caption[] for the frontend. */
export function alignedWordsToCaptions(words: AlignedWord[]): Caption[] {
  return words
    .filter(w => w.word.trim().length > 0)
    .map(w => ({
      text: w.word.trim(),
      startMs: w.start_ms,
      endMs: w.end_ms,
      timestampMs: Math.round((w.start_ms + w.end_ms) / 2),
      confidence: null,
    }));
}
