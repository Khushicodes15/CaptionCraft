import { Mp3Encoder } from "@breezystack/lamejs";

export type AudioChunk = { 
  base64: string; 
  offsetMs: number; 
  durationMs: number;
  validStartMs: number;
  validEndMs: number;
};

const TARGET_RATE = 16000;
/** Sarvam REST API limits to 30 seconds. We use 25s chunks with 1.5s overlap. */
const CHUNK_SECONDS = 25;
const OVERLAP_SECONDS = 1.5;

export async function readVideoMeta(
  file: File,
): Promise<{ durationSec: number; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const video = document.createElement("video");
      const timeout = setTimeout(() => {
        reject(new Error("Video metadata read timed out."));
      }, 10000);

      video.preload = "metadata";
      video.onloadedmetadata = () => {
        clearTimeout(timeout);
        resolve({
          durationSec: Number.isFinite(video.duration) ? video.duration : 0,
          width: video.videoWidth || 1080,
          height: video.videoHeight || 1920,
        });
      };
      video.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Could not read this video file."));
      };
      video.src = url;
      video.load();
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeMono16k(file: File): Promise<Float32Array> {
  const arrayBuffer = await file.arrayBuffer();
  const Ctx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer);
  } catch {
    throw new Error("This file has no readable audio track. Try an MP4, MOV or WebM with sound.");
  } finally {
    void ctx.close();
  }

  const frames = Math.ceil(decoded.duration * TARGET_RATE);
  const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

function encodeMp3(samples: Float32Array): Uint8Array {
  const encoder = new Mp3Encoder(1, TARGET_RATE, 48);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const blocks: Uint8Array[] = [];
  const blockSize = 1152;
  for (let i = 0; i < pcm.length; i += blockSize) {
    const buf = encoder.encodeBuffer(pcm.subarray(i, i + blockSize));
    if (buf.length > 0) blocks.push(new Uint8Array(buf));
  }
  const end = encoder.flush();
  if (end.length > 0) blocks.push(new Uint8Array(end));

  const total = blocks.reduce((sum, b) => sum + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of blocks) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

export async function extractAudioChunks(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<AudioChunk[]> {
  const samples = await decodeMono16k(file);
  onProgress?.(0.5);

  const chunkSamples = CHUNK_SECONDS * TARGET_RATE;
  const overlapSamples = OVERLAP_SECONDS * TARGET_RATE;
  const stepSamples = chunkSamples - overlapSamples;
  const chunks: AudioChunk[] = [];
  
  if (samples.length <= chunkSamples) {
    chunks.push({
      base64: toBase64(encodeMp3(samples)),
      offsetMs: 0,
      durationMs: (samples.length * 1000) / TARGET_RATE,
      validStartMs: 0,
      validEndMs: Infinity,
    });
    onProgress?.(1);
    return chunks;
  }

  const count = Math.ceil((samples.length - overlapSamples) / stepSamples);

  for (let i = 0; i < count; i++) {
    const start = i * stepSamples;
    const end = Math.min(start + chunkSamples, samples.length);
    const slice = samples.subarray(start, end);
    if (slice.length === 0) continue;
    
    // We only keep words that fall inside the unique window of this chunk
    // to avoid duplicate words across overlaps.
    const validStartMs = i === 0 ? 0 : ((start + overlapSamples / 2) * 1000) / TARGET_RATE;
    const validEndMs = i === count - 1 ? Infinity : ((start + chunkSamples - overlapSamples / 2) * 1000) / TARGET_RATE;

    chunks.push({
      base64: toBase64(encodeMp3(slice)),
      offsetMs: (start * 1000) / TARGET_RATE,
      durationMs: (slice.length * 1000) / TARGET_RATE,
      validStartMs,
      validEndMs,
    });
    onProgress?.(0.5 + (0.5 * (i + 1)) / count);
  }
  return chunks;
}
