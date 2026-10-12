import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";

let segmenterInstance: ImageSegmenter | null = null;
let segmenterPromise: Promise<ImageSegmenter> | null = null;

// Memory cache for generated masks (data URLs) keyed by videoKey + timeBucket
const memoryMaskCache = new Map<string, string>();

// Exponential moving average mask buffer for temporal smoothing across consecutive frames (export path)
let previousSmoothedMask: Float32Array | null = null;

/**
 * Initializes and returns the MediaPipe ImageSegmenter instance.
 * Reuses local WASM and local TFLite model from public/mediapipe/ with CDN fallback.
 */
export async function getHeadSegmenter(): Promise<ImageSegmenter> {
  if (segmenterInstance) return segmenterInstance;
  if (segmenterPromise) return segmenterPromise;

  segmenterPromise = (async () => {
    try {
      // 1. Resolve WASM assets (prefer local /mediapipe/wasm, fallback to CDN)
      let vision;
      try {
        vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      } catch (localErr) {
        console.warn("Could not load local WASM, falling back to CDN:", localErr);
        vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
      }

      // 2. Resolve Multiclass Model (prefer local /mediapipe/models/, fallback to Google Cloud Storage)
      let modelPath = "/mediapipe/models/selfie_multiclass_256x256.tflite";
      try {
        const headCheck = await fetch(modelPath, { method: "HEAD" });
        if (!headCheck.ok) {
          modelPath =
            "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";
        }
      } catch {
        modelPath =
          "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";
      }

      segmenterInstance = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });

      return segmenterInstance;
    } catch (err) {
      segmenterPromise = null;
      throw err;
    }
  })();

  return segmenterPromise;
}

export type HeadMaskResult = {
  maskCanvas: HTMLCanvasElement;
  maskDataUrl: string;
  width: number;
  height: number;
};

/**
 * Segments the person (full body, head, hair, skin, clothing, accessories) from the given visual frame.
 * Multiclass index semantics:
 * 0 = Background
 * 1 = Hair
 * 2 = Body-skin (neck, arms, shoulders, chest)
 * 3 = Face-skin
 * 4 = Clothes (shirt, jacket, dress, etc.)
 * 5 = Others (glasses, accessories, jewelry)
 *
 * Combining Categories 1, 2, 3, 4, 5 isolates the entire visible person,
 * naturally placing captions behind the head, hair, neck, shoulders, arms, and torso.
 */
export async function segmentHeadAndHair(
  source: CanvasImageSource,
  options?: {
    smooth?: boolean;
    featherPx?: number;
    videoKey?: string;
    timestampMs?: number;
  }
): Promise<HeadMaskResult> {
  const { smooth = true, featherPx = 1.5, videoKey, timestampMs } = options || {};

  // Check memory cache if videoKey and timestamp are provided
  const timeBucket = timestampMs !== undefined ? Math.round(timestampMs / 40) * 40 : null;
  const cacheKey = videoKey && timeBucket !== null ? `${videoKey}_${timeBucket}` : null;
  if (cacheKey && memoryMaskCache.has(cacheKey)) {
    const cachedUrl = memoryMaskCache.get(cacheKey)!;
    const img = new Image();
    img.src = cachedUrl;
    await new Promise<void>((resolve) => {
      if (img.complete) resolve();
      else img.onload = () => resolve();
    });
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.drawImage(img, 0, 0);
    return {
      maskCanvas: canvas,
      maskDataUrl: cachedUrl,
      width: 256,
      height: 256,
    };
  }

  const segmenter = await getHeadSegmenter();
  const result = segmenter.segment(source as any);

  if (!result || !result.categoryMask) {
    throw new Error("No segmentation mask produced by model.");
  }

  const categoryMask = result.categoryMask;
  const maskWidth = categoryMask.width;
  const maskHeight = categoryMask.height;
  const rawCategories = categoryMask.getAsUint8Array();

  const totalPixels = maskWidth * maskHeight;

  // Initialize smoothing buffer if needed
  if (!previousSmoothedMask || previousSmoothedMask.length !== totalPixels) {
    previousSmoothedMask = new Float32Array(totalPixels);
  }

  // Raw binary mask canvas
  const rawCanvas = document.createElement("canvas");
  rawCanvas.width = maskWidth;
  rawCanvas.height = maskHeight;
  const rawCtx = rawCanvas.getContext("2d");
  if (!rawCtx) throw new Error("Could not create 2D canvas context");

  const imgData = rawCtx.createImageData(maskWidth, maskHeight);
  const data = imgData.data;

  // Temporal smoothing weight: 0.85 current frame, 0.15 previous frame
  const alpha = smooth ? 0.85 : 1.0;

  for (let i = 0; i < totalPixels; i++) {
    const cat = rawCategories[i] ?? 0;
    // Full Person: Hair (1) + Body-skin (2) + Face-skin (3) + Clothes (4) + Accessories (5)
    // Category 0 is Background
    const isPersonPixel = cat >= 1 && cat <= 5 ? 1.0 : 0.0;

    let smoothedVal = isPersonPixel;
    if (smooth && previousSmoothedMask) {
      const prev = previousSmoothedMask[i] ?? isPersonPixel;
      smoothedVal = alpha * isPersonPixel + (1 - alpha) * prev;
      previousSmoothedMask[i] = smoothedVal;
    }

    const byteVal = Math.round(smoothedVal * 255);
    const offset = i * 4;
    data[offset] = 255; // R
    data[offset + 1] = 255; // G
    data[offset + 2] = 255; // B
    data[offset + 3] = byteVal; // Alpha
  }

  rawCtx.putImageData(imgData, 0, 0);

  // Feathered / Anti-aliased mask canvas
  const featheredCanvas = document.createElement("canvas");
  featheredCanvas.width = maskWidth;
  featheredCanvas.height = maskHeight;
  const fCtx = featheredCanvas.getContext("2d");
  if (fCtx) {
    if (featherPx > 0) {
      fCtx.filter = `blur(${featherPx}px)`;
    }
    fCtx.drawImage(rawCanvas, 0, 0);
    fCtx.filter = "none";
  }

  const maskDataUrl = featheredCanvas.toDataURL("image/png");

  // Cache result
  if (cacheKey) {
    memoryMaskCache.set(cacheKey, maskDataUrl);
    // Keep memory cache size bounded (max 500 frames)
    if (memoryMaskCache.size > 500) {
      const firstKey = memoryMaskCache.keys().next().value;
      if (firstKey) memoryMaskCache.delete(firstKey);
    }
  }

  categoryMask.close();

  return {
    maskCanvas: featheredCanvas,
    maskDataUrl,
    width: maskWidth,
    height: maskHeight,
  };
}

/**
 * Calculates source cropping rectangle for object-fit: cover.
 * Guarantees consistent mathematical alignment across any aspect ratio.
 */
export function getVideoCoverRect(
  videoWidth: number,
  videoHeight: number,
  targetWidth: number,
  targetHeight: number
) {
  const targetRatio = targetWidth / targetHeight;
  const videoRatio = videoWidth / videoHeight;

  let sx = 0;
  let sy = 0;
  let sw = videoWidth;
  let sh = videoHeight;

  if (videoRatio > targetRatio) {
    // Video is wider than target: center crop horizontally
    sw = videoHeight * targetRatio;
    sx = (videoWidth - sw) / 2;
  } else if (videoRatio < targetRatio) {
    // Video is taller than target: center crop vertically
    sh = videoWidth / targetRatio;
    sy = (videoHeight - sh) / 2;
  }

  return { sx, sy, sw, sh };
}

/**
 * Draws the source video onto the target context respecting object-fit: cover,
 * guaranteeing 1:1 pixel alignment with an HTML5 <video className="object-cover" />.
 */
export function drawVideoCover(
  ctx: CanvasRenderingContext2D,
  video: CanvasImageSource,
  targetWidth: number,
  targetHeight: number
) {
  let vw = targetWidth;
  let vh = targetHeight;
  if ("videoWidth" in video && (video as HTMLVideoElement).videoWidth) {
    vw = (video as HTMLVideoElement).videoWidth;
    vh = (video as HTMLVideoElement).videoHeight;
  } else if ("width" in video && (video as HTMLCanvasElement).width) {
    vw = (video as HTMLCanvasElement).width;
    vh = (video as HTMLCanvasElement).height;
  }

  const { sx, sy, sw, sh } = getVideoCoverRect(vw, vh, targetWidth, targetHeight);
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
}

/**
 * Draws the mask onto the target context applying the exact same fractional crop as the video.
 */
export function drawMaskCover(
  ctx: CanvasRenderingContext2D,
  maskCanvas: HTMLCanvasElement,
  videoWidth: number,
  videoHeight: number,
  targetWidth: number,
  targetHeight: number
) {
  const { sx, sy, sw, sh } = getVideoCoverRect(videoWidth, videoHeight, targetWidth, targetHeight);
  const msx = (sx / videoWidth) * maskCanvas.width;
  const msy = (sy / videoHeight) * maskCanvas.height;
  const msw = (sw / videoWidth) * maskCanvas.width;
  const msh = (sh / videoHeight) * maskCanvas.height;
  ctx.drawImage(maskCanvas, msx, msy, msw, msh, 0, 0, targetWidth, targetHeight);
}

export type CachedPreviewMask = {
  timestampMs: number;
  segmentId: string;
  canvas: HTMLCanvasElement;
  generation: number;
};

// Preview mask cache keyed by videoKey -> array of sorted entries
const previewMaskCache = new Map<string, CachedPreviewMask[]>();

/**
 * Returns the closest cached preview mask within maxToleranceMs, scoped strictly to the segmentId.
 * Guarantees that masks from one subtitle segment or scene will never leak into another.
 */
export function getClosestPreviewMask(
  videoKey: string,
  timestampMs: number,
  segmentId?: string,
  maxToleranceMs = 100
): HTMLCanvasElement | null {
  const entries = previewMaskCache.get(videoKey);
  if (!entries || entries.length === 0) return null;

  let bestEntry: CachedPreviewMask | null = null;
  let bestDelta = Infinity;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;

    const delta = Math.abs(entry.timestampMs - timestampMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestEntry = entry;
    }
    // Since entries are sorted by timestampMs, we can break early once beyond tolerance
    if (entry.timestampMs > timestampMs + maxToleranceMs) break;
  }

  if (bestEntry && bestDelta <= maxToleranceMs) {
    return bestEntry.canvas;
  }
  return null;
}

/**
 * Saves a preview mask canvas into the cache, maintaining timestamp sorting and bounded size.
 */
export function savePreviewMask(
  videoKey: string,
  timestampMs: number,
  canvas: HTMLCanvasElement,
  segmentId: string = "",
  generation: number = _previewGeneration
) {
  let entries = previewMaskCache.get(videoKey);
  if (!entries) {
    entries = [];
    previewMaskCache.set(videoKey, entries);
  }

  const newEntry: CachedPreviewMask = { timestampMs, segmentId, canvas, generation };
  const idx = entries.findIndex((e) => e.timestampMs >= timestampMs);
  if (idx === -1) {
    entries.push(newEntry);
  } else if (
    Math.abs(entries[idx]!.timestampMs - timestampMs) < 15 &&
    (!segmentId || entries[idx]!.segmentId === segmentId)
  ) {
    entries[idx] = newEntry;
  } else {
    entries.splice(idx, 0, newEntry);
  }

  // Keep preview cache bounded to 600 frames (~256KB per canvas = ~150MB max)
  if (entries.length > 600) {
    entries.shift();
  }
}

/**
 * Clears the preview mask cache.
 */
export function clearPreviewMaskCache(videoKey?: string) {
  if (videoKey) {
    previewMaskCache.delete(videoKey);
  } else {
    previewMaskCache.clear();
  }
}

// ─── Pre-warming Controller ──────────────────────────────────────────────────
// Manages background pre-computation of masks on an offscreen video element.
// Invariant: Pre-warming pauses IMMEDIATELY during active playback so it never
// contends for the main thread or GPU while the user is watching the video.

class PrewarmController {
  private abortController: AbortController | null = null;
  private isPlaybackPlaying = false;
  private offscreenVideo: HTMLVideoElement | null = null;

  public pause() {
    this.isPlaybackPlaying = true;
  }

  public resume() {
    this.isPlaybackPlaying = false;
  }

  public stop() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.offscreenVideo) {
      this.offscreenVideo.src = "";
      this.offscreenVideo.load();
      this.offscreenVideo = null;
    }
  }

  public async prewarm(
    videoSourceUrl: string,
    captions: Array<{ id?: string | undefined; startMs: number; endMs: number; styleOverrides?: any }>,
    globalBehindHead: boolean
  ): Promise<void> {
    this.stop();

    if (!videoSourceUrl || !captions || captions.length === 0 || this.isPlaybackPlaying) return;

    const activeSegments = captions.filter(
      (c) => (c.styleOverrides?.behindHead ?? globalBehindHead ?? false) === true
    );

    if (activeSegments.length === 0) return;

    const ac = new AbortController();
    this.abortController = ac;

    // Sample at ~15 FPS (every 66ms) across the active segments
    const tasks: Array<{ timeMs: number; segmentId: string }> = [];
    for (const seg of activeSegments) {
      const segId = seg.id || "";
      const start = Math.max(0, seg.startMs - 50);
      const end = seg.endMs + 300;
      for (let t = start; t <= end; t += 66) {
        if (!getClosestPreviewMask(videoSourceUrl, t, segId, 35)) {
          tasks.push({ timeMs: t, segmentId: segId });
        }
      }
    }

    if (tasks.length === 0) return;

    const video = document.createElement("video");
    this.offscreenVideo = video;
    video.crossOrigin = "anonymous";
    video.src = videoSourceUrl;
    video.muted = true;
    video.playsInline = true;

    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("Offscreen video metadata load failed"));
      });

      for (const task of tasks) {
        if (ac.signal.aborted) return;

        // If playback is running, wait until it pauses before performing any inference
        while (this.isPlaybackPlaying && !ac.signal.aborted) {
          await new Promise((r) => setTimeout(r, 150));
        }

        if (ac.signal.aborted) return;
        if (getClosestPreviewMask(videoSourceUrl, task.timeMs, task.segmentId, 35)) continue;

        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            resolve();
          };
          video.addEventListener("seeked", onSeeked);
          video.currentTime = Math.min(video.duration, Math.max(0, task.timeMs / 1000));
        });

        if (ac.signal.aborted) return;
        while (this.isPlaybackPlaying && !ac.signal.aborted) {
          await new Promise((r) => setTimeout(r, 150));
        }
        if (ac.signal.aborted) return;

        await segmentHeadAndHairForPreview(video, videoSourceUrl, task.timeMs, task.segmentId);

        // Yield cooperatively to the event loop so user interactions remain 100% fluid
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
    } catch {
      // Normal when aborted or video fails
    } finally {
      if (this.abortController === ac) {
        this.abortController = null;
      }
    }
  }
}

const prewarmController = new PrewarmController();

/**
 * Pre-warms preview masks in the background for segments where Behind Head is enabled.
 * Uses an offscreen video element and cooperatively yields/pauses during active playback.
 */
export async function prewarmPreviewMasks(
  videoSourceUrl: string,
  captions: Array<{ id?: string | undefined; startMs: number; endMs: number; styleOverrides?: any }>,
  globalBehindHead: boolean
): Promise<void> {
  return prewarmController.prewarm(videoSourceUrl, captions, globalBehindHead);
}

/**
 * Suspends background pre-warming (call when live video starts playing).
 */
export function pausePrewarming() {
  prewarmController.pause();
}

/**
 * Resumes background pre-warming (call when live video pauses).
 */
export function resumePrewarming() {
  prewarmController.resume();
}

/**
 * Completely stops any active background pre-warming.
 */
export function stopPrewarming() {
  prewarmController.stop();
}

// ─── Preview-specific reusable buffers ──────────────────────────────────────
let _previewRawCanvas: HTMLCanvasElement | null = null;
let _previewRawCtx: CanvasRenderingContext2D | null = null;
let _previewImgData: ImageData | null = null;

function getPreviewBuffers(w: number, h: number) {
  if (
    !_previewRawCanvas ||
    !_previewRawCtx ||
    _previewRawCanvas.width !== w ||
    _previewRawCanvas.height !== h
  ) {
    _previewRawCanvas = document.createElement("canvas");
    _previewRawCanvas.width = w;
    _previewRawCanvas.height = h;
    _previewRawCtx = _previewRawCanvas.getContext("2d")!;
    _previewImgData = _previewRawCtx.createImageData(w, h);
  }
  return {
    rawCanvas: _previewRawCanvas,
    rawCtx: _previewRawCtx!,
    imgData: _previewImgData!,
  };
}

let _previewInputCanvas: HTMLCanvasElement | null = null;
let _previewInputCtx: CanvasRenderingContext2D | null = null;

function getPreviewInputCanvas(vw: number, vh: number) {
  const maxDim = 360;
  let targetW = vw;
  let targetH = vh;
  if (vw > maxDim || vh > maxDim) {
    if (vw >= vh) {
      targetW = maxDim;
      targetH = Math.max(1, Math.round((vh / vw) * maxDim));
    } else {
      targetH = maxDim;
      targetW = Math.max(1, Math.round((vw / vh) * maxDim));
    }
  }

  if (!_previewInputCanvas) {
    _previewInputCanvas = document.createElement("canvas");
    _previewInputCtx = _previewInputCanvas.getContext("2d", { willReadFrequently: false })!;
  }
  if (_previewInputCanvas.width !== targetW || _previewInputCanvas.height !== targetH) {
    _previewInputCanvas.width = targetW;
    _previewInputCanvas.height = targetH;
  }
  return { inputCanvas: _previewInputCanvas, inputCtx: _previewInputCtx! };
}

// ─── Scene-change detection ─────────────────────────────────────────────────
let _sceneDetectCanvas: HTMLCanvasElement | null = null;
let _sceneDetectCtx: CanvasRenderingContext2D | null = null;
let _previousSceneSample: Uint8Array | null = null;
const SCENE_SAMPLE_SIZE = 8; // 8x8 grid = 64 pixels (192 color values)
const SCENE_CUT_THRESHOLD = 28; // average per-channel RGB difference to declare a cut

export function detectSceneChange(video: HTMLVideoElement | HTMLCanvasElement): boolean {
  if (!video) return false;
  const vw = "videoWidth" in video ? (video as HTMLVideoElement).videoWidth : (video as HTMLCanvasElement).width;
  if (!vw) return false;
  if ("readyState" in video && (video as HTMLVideoElement).readyState < 2) return false;

  if (!_sceneDetectCanvas) {
    _sceneDetectCanvas = document.createElement("canvas");
    _sceneDetectCanvas.width = SCENE_SAMPLE_SIZE;
    _sceneDetectCanvas.height = SCENE_SAMPLE_SIZE;
    _sceneDetectCtx = _sceneDetectCanvas.getContext("2d", { willReadFrequently: true })!;
  }

  _sceneDetectCtx!.drawImage(video, 0, 0, SCENE_SAMPLE_SIZE, SCENE_SAMPLE_SIZE);
  const pixels = _sceneDetectCtx!.getImageData(0, 0, SCENE_SAMPLE_SIZE, SCENE_SAMPLE_SIZE).data;

  const sampleCount = SCENE_SAMPLE_SIZE * SCENE_SAMPLE_SIZE;
  const currentSample = new Uint8Array(sampleCount * 3);
  for (let i = 0; i < sampleCount; i++) {
    currentSample[i * 3] = pixels[i * 4]!;
    currentSample[i * 3 + 1] = pixels[i * 4 + 1]!;
    currentSample[i * 3 + 2] = pixels[i * 4 + 2]!;
  }

  let isSceneCut = false;
  if (_previousSceneSample && _previousSceneSample.length === currentSample.length) {
    let totalDiff = 0;
    const totalVals = sampleCount * 3;
    for (let i = 0; i < totalVals; i++) {
      totalDiff += Math.abs(currentSample[i]! - _previousSceneSample[i]!);
    }
    const avgDiff = totalDiff / totalVals;
    isSceneCut = avgDiff > SCENE_CUT_THRESHOLD;
  }

  _previousSceneSample = currentSample;
  return isSceneCut;
}

/**
 * Resets scene-change detection state (on seek or source change).
 */
export function resetSceneDetection() {
  _previousSceneSample = null;
}

// ─── Preview generation counter ─────────────────────────────────────────────
let _previewGeneration = 0;

export function getPreviewGeneration(): number {
  return _previewGeneration;
}

export function bumpPreviewGeneration(): number {
  return ++_previewGeneration;
}

/**
 * Clears temporal smoothing buffer (on seek or cut).
 */
export function resetHeadSegmenterSmoothing() {
  previousSmoothedMask = null;
}

/**
 * Segmentation for preview (called ONLY when video is paused or during background pre-warming):
 * - Never run from the live video playback loop.
 * - Extracts clean head and hair mask.
 * - Applies 1.5px Gaussian spatial feathering for anti-aliased hair edges.
 * - Reuses canvas buffers to minimize GC pressure.
 * - Saves and returns an offscreen HTMLCanvasElement keyed to segmentId and generation.
 */
export async function segmentHeadAndHairForPreview(
  video: HTMLVideoElement,
  videoKey: string,
  timestampMs: number,
  segmentId: string = "",
  generation?: number
): Promise<HTMLCanvasElement | null> {
  if (!video || video.readyState < 2 || video.videoWidth === 0) return null;

  // Discard if generation is already stale
  if (generation !== undefined && generation !== _previewGeneration) {
    return null;
  }

  const segmenter = await getHeadSegmenter();

  if (generation !== undefined && generation !== _previewGeneration) {
    return null;
  }

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  let inputSource: CanvasImageSource = video;
  if (vw > 360 || vh > 360) {
    const { inputCanvas, inputCtx } = getPreviewInputCanvas(vw, vh);
    inputCtx.drawImage(video, 0, 0, inputCanvas.width, inputCanvas.height);
    inputSource = inputCanvas;
  }

  const result = segmenter.segment(inputSource as any);
  if (!result || !result.categoryMask) return null;

  const categoryMask = result.categoryMask;
  const maskWidth = categoryMask.width;
  const maskHeight = categoryMask.height;
  const rawCategories = categoryMask.getAsUint8Array();
  const totalPixels = maskWidth * maskHeight;

  // Reuse preview buffers
  const { rawCanvas, rawCtx, imgData } = getPreviewBuffers(maskWidth, maskHeight);
  const data = imgData.data;

  for (let i = 0; i < totalPixels; i++) {
    const cat = rawCategories[i] ?? 0;
    // Full person: Hair (1) + Body-skin (2) + Face-skin (3) + Clothes (4) + Accessories (5)
    // Category 0 is Background
    const isPersonPixel = cat >= 1 && cat <= 5;
    const offset = i * 4;
    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
    data[offset + 3] = isPersonPixel ? 255 : 0;
  }

  categoryMask.close();
  rawCtx.putImageData(imgData, 0, 0);

  // Independent canvas for the feathered result
  const featherCanvas = document.createElement("canvas");
  featherCanvas.width = maskWidth;
  featherCanvas.height = maskHeight;
  const fCtx = featherCanvas.getContext("2d");
  if (!fCtx) return null;

  fCtx.filter = "blur(1.5px)";
  fCtx.drawImage(rawCanvas, 0, 0);
  fCtx.filter = "none";

  if (generation !== undefined && generation !== _previewGeneration) {
    return null;
  }

  savePreviewMask(videoKey, timestampMs, featherCanvas, segmentId, _previewGeneration);
  return featherCanvas;
}

/**
 * Composites the foreground head and hair onto the preview canvas using destination-in masking.
 * Layer 3 result: Video frame strictly clipped to the head/hair region, 100% transparent everywhere else.
 * Runs in ~0.3ms on hardware 2D canvas.
 */
export function compositeHeadForegroundPreview(
  video: HTMLVideoElement,
  maskCanvas: HTMLCanvasElement,
  targetCanvas: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number
) {
  if (!video || video.readyState < 2 || !maskCanvas || !targetCanvas) return;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || targetWidth <= 0 || targetHeight <= 0) return;

  if (targetCanvas.width !== targetWidth || targetCanvas.height !== targetHeight) {
    targetCanvas.width = targetWidth;
    targetCanvas.height = targetHeight;
  }

  const ctx = targetCanvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  try {
    // 1. Draw source video frame with exact object-cover crop
    ctx.globalCompositeOperation = "source-over";
    drawVideoCover(ctx, video, targetWidth, targetHeight);

    // 2. Clip strictly using the head & hair mask with identical crop
    ctx.globalCompositeOperation = "destination-in";
    drawMaskCover(ctx, maskCanvas, vw, vh, targetWidth, targetHeight);
  } catch (err) {
    console.warn("compositeHeadForegroundPreview error:", err);
    ctx.clearRect(0, 0, targetWidth, targetHeight);
  } finally {
    ctx.globalCompositeOperation = "source-over";
  }
}

/**
 * Composites the foreground head and hair onto a target canvas using destination-in masking.
 * Layer 3 result: Video frame strictly clipped to the head/hair region, transparent everywhere else.
 */
export function compositeHeadForeground(
  videoSource: CanvasImageSource,
  maskCanvas: HTMLCanvasElement,
  targetCanvas: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number
) {
  if (!videoSource || !maskCanvas || !targetCanvas) return;

  let vw = targetWidth;
  let vh = targetHeight;
  if ("videoWidth" in videoSource && (videoSource as HTMLVideoElement).videoWidth) {
    vw = (videoSource as HTMLVideoElement).videoWidth;
    vh = (videoSource as HTMLVideoElement).videoHeight;
  } else if ("width" in videoSource && (videoSource as HTMLCanvasElement).width) {
    vw = (videoSource as HTMLCanvasElement).width;
    vh = (videoSource as HTMLCanvasElement).height;
  }

  if (targetCanvas.width !== targetWidth || targetCanvas.height !== targetHeight) {
    targetCanvas.width = targetWidth;
    targetCanvas.height = targetHeight;
  }

  const ctx = targetCanvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  try {
    // 1. Draw source video frame with object-fit: cover alignment
    ctx.globalCompositeOperation = "source-over";
    drawVideoCover(ctx, videoSource, targetWidth, targetHeight);

    // 2. Clip using the head & hair mask
    ctx.globalCompositeOperation = "destination-in";
    drawMaskCover(ctx, maskCanvas, vw, vh, targetWidth, targetHeight);
  } catch (err) {
    console.warn("compositeHeadForeground error:", err);
    ctx.clearRect(0, 0, targetWidth, targetHeight);
  } finally {
    ctx.globalCompositeOperation = "source-over";
  }
}

/**
 * Pre-extracts head and hair mask data URLs for frames belonging to segments with Behind Head enabled.
 * Used to pass synchronized mask data to Remotion for high-quality MP4 export.
 */
export async function extractSegmentMasksForExport(
  videoSourceUrl: string,
  captions: Array<{ startMs: number; endMs: number; styleOverrides?: any }>,
  globalBehindHead: boolean,
  fps: number = 30,
  onProgress?: (progress: { current: number; total: number; percent: number }) => void
): Promise<Record<number, string>> {
  // 1. Filter segments that have Behind Head enabled
  const activeSegments = captions.filter(
    (c) => (c.styleOverrides?.behindHead ?? globalBehindHead ?? false) === true
  );

  if (activeSegments.length === 0) {
    return {};
  }

  // 2. Collect unique frame numbers that need masks
  const frameSet = new Set<number>();
  for (const seg of activeSegments) {
    const startFrame = Math.max(0, Math.floor((seg.startMs / 1000) * fps));
    const endFrame = Math.ceil(((seg.endMs + 300) / 1000) * fps);
    // Frame-accurate extraction for export — do not skip frames
    const step = 1;
    for (let f = startFrame; f <= endFrame; f += step) {
      frameSet.add(f);
    }
  }

  const sortedFrames = Array.from(frameSet).sort((a, b) => a - b);
  const totalFrames = sortedFrames.length;
  if (totalFrames === 0) return {};

  const masks: Record<number, string> = {};

  // 3. Create an offscreen video element for extraction
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.src = videoSourceUrl;
  video.muted = true;
  video.playsInline = true;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Failed to load video metadata for Behind Head export"));
    });

    resetHeadSegmenterSmoothing();
    resetSceneDetection();

    // 4. Sequentially seek and segment
    for (let i = 0; i < sortedFrames.length; i++) {
      const frame = sortedFrames[i];
      if (frame === undefined) continue;
      const timeMs = (frame / fps) * 1000;
      const timeSec = timeMs / 1000;

      // Check memory cache first
      const cacheKey = `${videoSourceUrl}_${Math.round(timeMs / 40) * 40}`;
      if (memoryMaskCache.has(cacheKey)) {
        masks[frame] = memoryMaskCache.get(cacheKey)!;
      } else {
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener("seeked", onSeeked);
            resolve();
          };
          video.addEventListener("seeked", onSeeked);
          video.currentTime = Math.min(video.duration, Math.max(0, timeSec));
        });

        const isCut = detectSceneChange(video);
        if (isCut) {
          resetHeadSegmenterSmoothing();
        }

        try {
          const res = await segmentHeadAndHair(video, {
            videoKey: videoSourceUrl,
            timestampMs: timeMs,
            smooth: !isCut,
            featherPx: 1.5,
          });
          masks[frame] = res.maskDataUrl;
        } catch (segErr) {
          console.warn(`Behind Head export segmentation error at frame ${frame}:`, segErr);
        }
      }

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: totalFrames,
          percent: Math.round(((i + 1) / totalFrames) * 100),
        });
      }
    }
  } finally {
    video.src = "";
    video.load();
    resetSceneDetection();
  }

  return masks;
}
