import React, { useRef, useState, useEffect, useCallback } from "react";
import { CaptionOverlay } from "./CaptionOverlay";
import type { Caption, CaptionPosition, CaptionStyle, EmphasisMap } from "../../modules/styles/types";
import {
  getClosestPreviewMask,
  segmentHeadAndHairForPreview,
  compositeHeadForegroundPreview,
  clearPreviewMaskCache,
  prewarmPreviewMasks,
  pausePrewarming,
  resumePrewarming,
  stopPrewarming,
  getPreviewGeneration,
  bumpPreviewGeneration,
  resetHeadSegmenterSmoothing,
  detectSceneChange,
  resetSceneDetection,
} from "../segmentation/headSegmenter";

export type VideoPreviewProps = {
  videoSrc: string;
  captions: Caption[];
  emphasis: EmphasisMap;
  style: CaptionStyle;
  position: CaptionPosition;
  wordsPerLine: number;
  width: number;
  height: number;
  onPositionChange?: ((pos: CaptionPosition, id?: string) => void) | undefined;
  isSelected?: boolean | undefined;
  selectedCaptionId?: string | null | undefined;
  onSelected?: ((id?: string | null) => void) | undefined;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  styleState?: any;
  positionScope?: "all" | "segment";
};

/**
 * Memoized CaptionOverlay wrapper.
 * Prevents the overlay from re-rendering on every video presentation frame.
 * Only re-renders when caption timing, style, or selection actually changes.
 */
const MemoizedCaptionOverlay = React.memo(CaptionOverlay);

export const VideoPreview: React.FC<VideoPreviewProps> = ({
  videoSrc,
  captions,
  emphasis,
  style,
  position,
  wordsPerLine,
  width,
  height,
  onPositionChange,
  isSelected,
  selectedCaptionId,
  onSelected,
  styleState,
  videoRef: externalVideoRef,
  positionScope = "all",
}) => {
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const videoRef = externalVideoRef || internalVideoRef;
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const fgHeadCanvasRef = useRef<HTMLCanvasElement>(null);

  // Segmentation state refs (used exclusively in paused mode)
  const isSegmentingRef = useRef(false);
  const pendingPausedTimeRef = useRef<number | null>(null);

  // Tracking the currently rendered mask and segment to prevent cross-scene or cross-segment bleed
  const lastRenderedMaskRef = useRef<HTMLCanvasElement | null>(null);
  const lastRenderedTimeRef = useRef<number>(-1);
  const lastRenderedSegmentIdRef = useRef<string | null>(null);

  // Throttle on-demand segmentation during playback (~10-11 fps, every 90ms)
  const lastSegmentRequestTimeRef = useRef<number>(0);

  // Generation counter ref — tracks seek/source changes to discard stale async results
  const localGenerationRef = useRef<number>(getPreviewGeneration());

  // Throttle React state updates for currentTimeMs to ~12.5 fps (80ms)
  const lastStateUpdateRef = useRef<number>(0);

  // References to keep callbacks synchronized without re-subscriptions
  const captionsRef = useRef(captions);
  captionsRef.current = captions;
  const selectedCaptionIdRef = useRef(selectedCaptionId);
  selectedCaptionIdRef.current = selectedCaptionId;
  const styleStateRef = useRef(styleState);
  styleStateRef.current = styleState;
  const videoSrcRef = useRef(videoSrc);
  videoSrcRef.current = videoSrc;
  const dimensionsRef = useRef({ width, height });
  dimensionsRef.current = { width, height };

  // Pre-warm preview masks in the background for active Behind Head segments
  useEffect(() => {
    if (!videoSrc) return;
    const isGlobal = Boolean(styleState?.behindHead);
    const hasAnyBehindHead =
      isGlobal || captions.some((c) => c.styleOverrides?.behindHead === true);

    if (!hasAnyBehindHead) {
      stopPrewarming();
      // If Behind Head turned off, clear canvas immediately
      const canvas = fgHeadCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      lastRenderedMaskRef.current = null;
      lastRenderedTimeRef.current = -1;
      lastRenderedSegmentIdRef.current = null;
      return;
    }

    // Debounce prewarming to avoid decoder contention during dragging, typing, or styling
    const timer = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused) return;
      prewarmPreviewMasks(videoSrc, captions, isGlobal);
    }, 600);

    return () => clearTimeout(timer);
  }, [videoSrc, styleState?.behindHead, captions]);

  /**
   * Behind Head frame renderer.
   * INVARIANT: During active playback (isPaused === false), this function NEVER triggers
   * inference. It only queries the memory cache and composites via 2D canvas drawImage (<0.5ms).
   * Inference is ONLY scheduled when the video is paused (isPaused === true).
   */
  const renderBehindHead = useCallback((targetMs: number, isPaused: boolean = false) => {
    const video = videoRef.current;
    const canvas = fgHeadCanvasRef.current;
    if (!canvas || !video || video.readyState < 2 || video.videoWidth === 0) return;

    const curCaptions = captionsRef.current;
    const curSelectedId = selectedCaptionIdRef.current;
    const curStyleState = styleStateRef.current;
    const curVideoSrc = videoSrcRef.current;
    const { width: targetW, height: targetH } = dimensionsRef.current;

    // Ensure canvas internal resolution matches project dimensions
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const isGlobalBehindHead = Boolean(curStyleState?.behindHead);

    // 1. Identify active caption segment near targetMs
    const activeSegment = curCaptions.find(
      (c) => targetMs >= c.startMs - 200 && targetMs <= c.endMs + 500
    );

    // If paused and a segment is selected, keep it active for visual editing
    const effectiveSegment =
      activeSegment ||
      (curSelectedId && isPaused ? curCaptions.find((c) => c.id === curSelectedId) : null);

    // Determine if Behind Head is active right now:
    let isBehindHeadActive = false;
    if (effectiveSegment) {
      if (effectiveSegment.styleOverrides?.behindHead !== undefined) {
        isBehindHeadActive = Boolean(effectiveSegment.styleOverrides.behindHead);
      } else {
        isBehindHeadActive = isGlobalBehindHead;
      }
    } else {
      // No caption is currently on screen at targetMs.
      // If Behind Head is global, maintain continuous segmentation so masks are
      // ready and unbroken when the next caption appears!
      isBehindHeadActive = isGlobalBehindHead;
    }

    if (!isBehindHeadActive) {
      if (lastRenderedMaskRef.current !== null) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, targetW, targetH);
        lastRenderedMaskRef.current = null;
        lastRenderedTimeRef.current = -1;
      }
      return;
    }

    // 2. Cache lookup: up to 120ms tolerance (~3-4 frames)
    const cachedMask = getClosestPreviewMask(curVideoSrc, targetMs, undefined, 120);
    if (cachedMask) {
      compositeHeadForegroundPreview(video, cachedMask, canvas, targetW, targetH);
      lastRenderedMaskRef.current = cachedMask;
      lastRenderedTimeRef.current = targetMs;
      return;
    }

    // 3. Continuity fallback: If cache misses for this exact frame, reuse the recent valid mask
    // within 300ms. This seamlessly bridges the ~90ms gaps between asynchronous inferences
    // without any visual flicker, dropouts, or canvas clearing.
    if (
      lastRenderedMaskRef.current &&
      Math.abs(targetMs - lastRenderedTimeRef.current) <= 300
    ) {
      compositeHeadForegroundPreview(video, lastRenderedMaskRef.current, canvas, targetW, targetH);
    } else if (!lastRenderedMaskRef.current) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, targetW, targetH);
    }

    // 4. Asynchronous On-Demand Inference (Non-blocking):
    // Runs MediaPipe 360p inference in the background (~5-8ms).
    // - During playback: throttled to ~10 FPS (every 90ms) so it runs smoothly without blocking rendering.
    // - When paused: runs immediately for precise scrubbing.
    const now = performance.now();
    const canSchedulePlayback = !isPaused && (now - lastSegmentRequestTimeRef.current >= 90);
    const canSchedulePaused = isPaused;

    if (!isSegmentingRef.current && (canSchedulePlayback || canSchedulePaused)) {
      isSegmentingRef.current = true;
      lastSegmentRequestTimeRef.current = now;
      const requestGen = localGenerationRef.current;
      const requestTime = targetMs;

      segmentHeadAndHairForPreview(video, curVideoSrc, requestTime, "", requestGen)
        .then((mask) => {
          if (!mask || !fgHeadCanvasRef.current || !video) return;
          // Verify generation has not changed (no seek or source change)
          if (requestGen !== localGenerationRef.current) return;

          const currentVideoMs = video.currentTime * 1000;
          const maxDiff = video.paused ? 150 : 300;
          if (Math.abs(currentVideoMs - requestTime) <= maxDiff) {
            const { width: tw, height: th } = dimensionsRef.current;
            compositeHeadForegroundPreview(video, mask, fgHeadCanvasRef.current, tw, th);
            lastRenderedMaskRef.current = mask;
            lastRenderedTimeRef.current = currentVideoMs;
          }
        })
        .catch((err) => {
          console.warn("Behind Head preview segmentation error:", err);
        })
        .finally(() => {
          isSegmentingRef.current = false;
          // If the user scrubbed to another time while inference was running, process the latest time
          if (pendingPausedTimeRef.current !== null && video.paused) {
            const nextTime = pendingPausedTimeRef.current;
            pendingPausedTimeRef.current = null;
            renderBehindHead(nextTime, true);
          }
        });
    } else if (isPaused && isSegmentingRef.current) {
      pendingPausedTimeRef.current = targetMs;
    }
  }, []);

  // Video presentation loop & event bindings
  useEffect(() => {
    let handle: number;
    let fallbackHandle: number;
    let isSubscribed = true;
    let attachedVideo: HTMLVideoElement | null = null;
    let cleanListeners: (() => void) | null = null;

    const attach = (video: HTMLVideoElement) => {
      if (attachedVideo === video) return;
      if (cleanListeners) cleanListeners();
      attachedVideo = video;

      const loop = (now?: number, metadata?: any) => {
        if (!isSubscribed) return;
        const curMs =
          metadata?.mediaTime !== undefined ? metadata.mediaTime * 1000 : video.currentTime * 1000;

        // If playing, detect scene changes on the sequential video presentation
        if (!video.paused && detectSceneChange(video)) {
          lastRenderedMaskRef.current = null;
          lastRenderedTimeRef.current = -1;
          const canvas = fgHeadCanvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
        }

        // Throttle React state updates to ~12.5 fps (80ms) for CaptionOverlay
        const wallNow = performance.now();
        if (wallNow - lastStateUpdateRef.current >= 80) {
          setCurrentTimeMs(curMs);
          lastStateUpdateRef.current = wallNow;
        }

        // Render Behind Head foreground strictly from cached masks
        renderBehindHead(curMs, video.paused);

        if ("requestVideoFrameCallback" in video) {
          handle = (video as any).requestVideoFrameCallback(loop);
        } else {
          fallbackHandle = requestAnimationFrame(loop);
        }
      };

      if ("requestVideoFrameCallback" in video) {
        handle = (video as any).requestVideoFrameCallback(loop);
      } else {
        fallbackHandle = requestAnimationFrame(loop);
      }

      // Play handler: pause pre-warming loop cooperatively (preserves cached masks)
      const onPlay = () => {
        if (!isSubscribed) return;
        pausePrewarming();
        pendingPausedTimeRef.current = null;
      };

      // Pause handler: resume pre-warming and render high-precision paused frame
      const onPause = () => {
        if (!isSubscribed) return;
        resumePrewarming();
        const curMs = video.currentTime * 1000;
        setCurrentTimeMs(curMs);
        lastStateUpdateRef.current = performance.now();
        renderBehindHead(curMs, true /* isPaused */);
      };

      // Seek handler: invalidate stale state, clear canvas, and render new position
      const onSeeked = () => {
        if (!isSubscribed) return;
        const curMs = video.currentTime * 1000;
        const newGen = bumpPreviewGeneration();
        localGenerationRef.current = newGen;
        resetHeadSegmenterSmoothing();
        resetSceneDetection();
        isSegmentingRef.current = false;
        pendingPausedTimeRef.current = null;
        lastRenderedMaskRef.current = null;
        lastRenderedTimeRef.current = -1;
        lastRenderedSegmentIdRef.current = null;

        // Clear canvas immediately on seek
        const canvas = fgHeadCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        setCurrentTimeMs(curMs);
        lastStateUpdateRef.current = performance.now();
        renderBehindHead(curMs, video.paused);
      };

      video.addEventListener("play", onPlay);
      video.addEventListener("pause", onPause);
      video.addEventListener("seeked", onSeeked);

      cleanListeners = () => {
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("seeked", onSeeked);
      };
    };

    const check = () => {
      const v = videoRef.current;
      if (v) attach(v);
    };

    check();
    const interval = setInterval(check, 200);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
      if (cleanListeners) cleanListeners();
      if (attachedVideo) {
        if ("requestVideoFrameCallback" in attachedVideo && handle) {
          (attachedVideo as any).cancelVideoFrameCallback(handle);
        }
      }
      if (fallbackHandle) {
        cancelAnimationFrame(fallbackHandle);
      }
      stopPrewarming();
      clearPreviewMaskCache(videoSrc);
    };
  }, [videoSrc, renderBehindHead]);

  // On video source change, reset scene/generation state
  useEffect(() => {
    const newGen = bumpPreviewGeneration();
    localGenerationRef.current = newGen;
    resetSceneDetection();
    resetHeadSegmenterSmoothing();
    stopPrewarming();
    lastRenderedMaskRef.current = null;
    lastRenderedTimeRef.current = -1;
    lastRenderedSegmentIdRef.current = null;
    isSegmentingRef.current = false;
    pendingPausedTimeRef.current = null;

    const canvas = fgHeadCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [videoSrc]);

  // Update canvas when paused if selection or style changed
  useEffect(() => {
    const v = videoRef.current;
    if (v && v.paused) {
      renderBehindHead(v.currentTime * 1000, true /* isPaused */);
    }
  }, [selectedCaptionId, styleState?.behindHead, captions, renderBehindHead]);

  // Auto-move video preview to selected subtitle segment when selectedCaptionId changes
  useEffect(() => {
    if (!selectedCaptionId) return;
    const target = captions.find((c) => c.id === selectedCaptionId);
    if (!target) return;
    const video = videoRef.current;
    if (video) {
      const curMs = video.currentTime * 1000;
      if (curMs < target.startMs || curMs > target.endMs) {
        video.currentTime = target.startMs / 1000;
        setCurrentTimeMs(target.startMs);
      }
    }
  }, [selectedCaptionId, captions]);

  return (
    <div
      className="relative w-full h-full bg-black flex items-center justify-center rounded-lg overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget && (isSelected || selectedCaptionId)) {
          onSelected?.(null);
        }
      }}
    >
      {/* Aspect-ratio constrained container */}
      <div
        className="relative"
        style={{
          aspectRatio: `${width}/${height}`,
          maxHeight: "100%",
          maxWidth: "100%",
        }}
      >
        {/* Layer 1: Base Video — native hardware DirectComposition rendering */}
        <video
          ref={videoRef}
          src={videoSrc}
          className="block w-full h-full object-cover"
          controls
          crossOrigin="anonymous"
          playsInline
          onClick={() => {
            if (isSelected || selectedCaptionId) {
              onSelected?.(null);
            }
          }}
        />

        {/* Layer 2: Caption overlay layer — composited between Video (Layer 1) and Foreground Subject (Layer 3) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && (isSelected || selectedCaptionId)) {
              onSelected?.(null);
            }
          }}
        >
          <MemoizedCaptionOverlay
            currentTimeMs={currentTimeMs}
            captions={captions}
            emphasis={emphasis}
            style={style}
            position={position}
            wordsPerLine={wordsPerLine}
            videoWidth={width}
            videoHeight={height}
            onPositionChange={onPositionChange}
            isSelected={isSelected}
            selectedCaptionId={selectedCaptionId}
            onSelected={onSelected}
            styleState={styleState}
            positionScope={positionScope}
          />
        </div>

        {/* Layer 3: Foreground Head & Hair — composited directly on top of CaptionOverlay */}
        <canvas
          ref={fgHeadCanvasRef}
          width={width}
          height={height}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ zIndex: 30 }}
        />
      </div>
    </div>
  );
};
