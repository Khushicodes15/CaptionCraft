import React, { useEffect, useMemo, useRef, useState } from "react";
import { type Caption } from "@/modules/styles/types";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Trash2,
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo2,
} from "lucide-react";

export type TimelineProps = {
  captions: Caption[];
  setCaptions: React.Dispatch<React.SetStateAction<Caption[]>>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  durationMs: number;
  selectedCaptionId: string | null;
  onSelectCaption: (id: string | null) => void;
  onDeleteCaption?: (id: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onHistoryCommit?: (newCaptions: Caption[]) => void;
};

/** Formats time into mm:ss.f matching VEED's timecode display */
function formatVeedTime(ms: number): string {
  const totalSec = Math.max(0, ms) / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const tenths = Math.floor((totalSec % 1) * 10);
  return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}.${tenths}`;
}

/** Formats time tick labels on ruler: 0s, 10s, 20s ... 1m, 1m 10s */
function formatRulerTick(sec: number): string {
  if (sec === 0) return "0s";
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem === 0 ? `${min}m` : `${min}m ${rem}s`;
}

export const Timeline: React.FC<TimelineProps> = ({
  captions,
  setCaptions,
  videoRef,
  durationMs,
  selectedCaptionId,
  onSelectCaption,
  onDeleteCaption,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onHistoryCommit,
}) => {
  const currentCaptionsRef = useRef(captions);
  currentCaptionsRef.current = captions;
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isScrubbingPlayhead = useRef(false);

  // Synchronize playback & playhead with video element reliably
  useEffect(() => {
    let rfcHandle: number | null = null;
    let rafHandle: number | null = null;
    let isSubscribed = true;
    let attachedVideo: HTMLVideoElement | null = null;
    let cleanListeners: (() => void) | null = null;

    const attach = (video: HTMLVideoElement) => {
      if (attachedVideo === video) return;
      if (cleanListeners) cleanListeners();
      attachedVideo = video;

      const updateState = () => {
        if (!isSubscribed) return;
        setCurrentTimeMs(video.currentTime * 1000);
        setIsPlaying(!video.paused);
      };

      const loop = () => {
        if (!isSubscribed) return;
        updateState();
        if ("requestVideoFrameCallback" in video) {
          rfcHandle = (video as any).requestVideoFrameCallback(loop);
        } else {
          rafHandle = requestAnimationFrame(loop);
        }
      };

      if ("requestVideoFrameCallback" in video) {
        rfcHandle = (video as any).requestVideoFrameCallback(loop);
      } else {
        rafHandle = requestAnimationFrame(loop);
      }

      const onPlay = () => {
        if (!isSubscribed) return;
        setIsPlaying(true);
        updateState();
      };
      const onPause = () => {
        if (!isSubscribed) return;
        setIsPlaying(false);
        updateState();
      };
      const onTimeUpdate = () => {
        if (!isSubscribed) return;
        updateState();
      };

      video.addEventListener("play", onPlay);
      video.addEventListener("playing", onPlay);
      video.addEventListener("pause", onPause);
      video.addEventListener("ended", onPause);
      video.addEventListener("timeupdate", onTimeUpdate);
      video.addEventListener("seeked", onTimeUpdate);

      updateState();

      cleanListeners = () => {
        video.removeEventListener("play", onPlay);
        video.removeEventListener("playing", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("ended", onPause);
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.removeEventListener("seeked", onTimeUpdate);
      };
    };

    const checkVideo = () => {
      const v = videoRef.current || document.querySelector("video");
      if (v) attach(v);
    };

    checkVideo();
    const interval = setInterval(checkVideo, 200);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
      if (cleanListeners) cleanListeners();
      if (attachedVideo) {
        if (rfcHandle !== null && "cancelVideoFrameCallback" in attachedVideo) {
          (attachedVideo as any).cancelVideoFrameCallback(rfcHandle);
        }
        if (rafHandle !== null) {
          cancelAnimationFrame(rafHandle);
        }
      }
    };
  }, [videoRef]);

  const togglePlay = () => {
    const video = videoRef.current || document.querySelector("video");
    if (!video) return;
    if (video.paused) {
      video.play().catch((err) => console.warn("Video play failed:", err));
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleSkipBack = () => {
    const video = videoRef.current || document.querySelector("video");
    if (!video) return;
    const target = Math.max(0, currentTimeMs - 5000);
    video.currentTime = target / 1000;
    setCurrentTimeMs(target);
    video.dispatchEvent(new Event("timeupdate"));
    video.dispatchEvent(new Event("seeked"));
  };

  const handleSkipForward = () => {
    const video = videoRef.current || document.querySelector("video");
    if (!video) return;
    const target = Math.min(durationMs, currentTimeMs + 5000);
    video.currentTime = target / 1000;
    setCurrentTimeMs(target);
    video.dispatchEvent(new Event("timeupdate"));
    video.dispatchEvent(new Event("seeked"));
  };

  // Base scale: at zoom = 1, 1000ms = 60px
  const pxPerMs = 0.06 * zoom;
  const contentWidth = Math.max(durationMs * pxPerMs, (scrollRef.current?.clientWidth || 800) - 30);

  // Seek video and playhead
  const seekToMs = (ms: number) => {
    const clamped = Math.max(0, Math.min(ms, durationMs));
    if (videoRef.current) {
      videoRef.current.currentTime = clamped / 1000;
      videoRef.current.dispatchEvent(new Event("timeupdate"));
      videoRef.current.dispatchEvent(new Event("seeked"));
    }
    setCurrentTimeMs(clamped);
  };

  // Delete selected subtitle
  const handleDelete = () => {
    if (!selectedCaptionId) return;
    if (onDeleteCaption) {
      onDeleteCaption(selectedCaptionId);
    } else {
      setCaptions((prev) => prev.filter((c) => c.id !== selectedCaptionId));
      onSelectCaption(null);
    }
  };

  // Snapshot-based Dragging & Trimming with ripple policy
  const initialCaptionsRef = useRef<Caption[]>([]);
  const [draggingSeg, setDraggingSeg] = useState<{
    id: string;
    type: "move" | "left" | "right";
    startX: number;
    startVal: number;
    origDuration: number;
  } | null>(null);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!draggingSeg) return;
      const dx = e.clientX - draggingSeg.startX;
      const dMs = dx / pxPerMs;

      const origCaptions = initialCaptionsRef.current;
      const targetIdx = origCaptions.findIndex((c) => c.id === draggingSeg.id);
      if (targetIdx === -1) return;
      const origTarget = origCaptions[targetIdx];
      if (!origTarget) return;

      if (draggingSeg.type === "right") {
        // Extending or shortening right edge:
        // Ripple behavior: extending pushes subsequent segments forward,
        // shortening pulls subsequent segments backward, preserving their durations and order.
        const minDuration = 150;
        const newTargetEnd = Math.max(origTarget.startMs + minDuration, Math.round(origTarget.endMs + dMs));
        const delta = newTargetEnd - origTarget.endMs;

        const updated: Caption[] = [...origCaptions];
        updated[targetIdx] = {
          ...origTarget,
          startMs: origTarget.startMs,
          endMs: newTargetEnd,
        };

        // Ripple forward/backward for all subsequent segments
        let prevEnd = newTargetEnd;
        for (let i = targetIdx + 1; i < origCaptions.length; i++) {
          const seg = origCaptions[i];
          if (!seg) continue;
          const segDuration = Math.max(minDuration, seg.endMs - seg.startMs);
          const proposedStart = seg.startMs + delta;
          // Never overlap previous segment's end
          const newStart = Math.max(prevEnd, Math.round(proposedStart));
          const newEnd = newStart + segDuration;
          updated[i] = {
            ...seg,
            startMs: newStart,
            endMs: newEnd,
          };
          prevEnd = newEnd;
        }

        setCaptions(updated);
      } else if (draggingSeg.type === "left") {
        // Trimming left edge:
        // Clamped so it cannot overlap preceding segment's end
        const prevSeg = targetIdx > 0 ? origCaptions[targetIdx - 1] : undefined;
        const prevEnd = prevSeg ? prevSeg.endMs : 0;
        const maxStart = origTarget.endMs - 150;
        const newStart = Math.max(prevEnd, Math.min(maxStart, Math.round(origTarget.startMs + dMs)));

        setCaptions(
          origCaptions.map((c, i) =>
            i === targetIdx ? { ...c, startMs: newStart } : c
          )
        );
      } else if (draggingSeg.type === "move") {
        // Moving segment along timeline:
        // Clamped between preceding segment's end and succeeding segment's start
        const prevSeg = targetIdx > 0 ? origCaptions[targetIdx - 1] : undefined;
        const nextSeg = targetIdx < origCaptions.length - 1 ? origCaptions[targetIdx + 1] : undefined;
        const prevEnd = prevSeg ? prevSeg.endMs : 0;
        const nextStart = nextSeg ? nextSeg.startMs : durationMs;
        const maxStart = Math.max(prevEnd, nextStart - draggingSeg.origDuration);
        const newStart = Math.max(prevEnd, Math.min(maxStart, Math.round(origTarget.startMs + dMs)));
        const newEnd = newStart + draggingSeg.origDuration;

        setCaptions(
          origCaptions.map((c, i) =>
            i === targetIdx ? { ...c, startMs: newStart, endMs: newEnd } : c
          )
        );
      }
    };

    const handleUp = () => {
      if (draggingSeg) {
        onHistoryCommit?.(currentCaptionsRef.current);
        setDraggingSeg(null);
      }
    };

    if (draggingSeg) {
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [draggingSeg, pxPerMs, durationMs, setCaptions]);

  // Scrubbing playhead on ruler
  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;
    isScrubbingPlayhead.current = true;
    const rect = scrollRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollRef.current.scrollLeft;
    seekToMs(x / pxPerMs);

    const onMouseMove = (moveEv: MouseEvent) => {
      if (!isScrubbingPlayhead.current || !scrollRef.current) return;
      const moveX = moveEv.clientX - rect.left + scrollRef.current.scrollLeft;
      seekToMs(moveX / pxPerMs);
    };

    const onMouseUp = () => {
      isScrubbingPlayhead.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Fit zoom to container width
  const handleFitZoom = () => {
    if (!scrollRef.current || durationMs <= 0) return;
    const containerW = scrollRef.current.clientWidth - 40;
    const targetPxPerMs = containerW / durationMs;
    const calculatedZoom = Math.max(0.3, Math.min(4.0, targetPxPerMs / 0.06));
    setZoom(Number(calculatedZoom.toFixed(2)));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || (document.activeElement as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedCaptionId) {
          e.preventDefault();
          handleDelete();
        }
      } else if (e.key === "Escape") {
        if (selectedCaptionId) {
          e.preventDefault();
          onSelectCaption(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, selectedCaptionId]);

  // Ruler tick interval calculation (1s, 2s, 5s, 10s depending on zoom)
  const tickStepSec = zoom >= 2.5 ? 2 : zoom >= 1.2 ? 5 : 10;
  const totalTicks = Math.ceil(durationMs / (tickStepSec * 1000)) + 1;

  // Waveform bar count scaled with width
  const waveformBarCount = useMemo(() => {
    return Math.max(60, Math.floor(contentWidth / 4));
  }, [contentWidth]);

  return (
    <div className="flex flex-col bg-card border-t border-border select-none text-foreground font-sans z-20 h-[175px] flex-shrink-0 transition-colors">
      {/* ── TOP CONTROL BAR (Simplified, matching inspiration) ───────────────── */}
      <div className="flex items-center justify-between px-3 h-10 border-b border-border bg-muted/30 flex-shrink-0 text-xs">
        {/* Left: Undo, Redo, Delete */}
        <div className="flex items-center gap-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={`p-1.5 rounded transition-colors ${
              canUndo
                ? "text-muted-foreground hover:text-foreground hover:bg-muted/70 cursor-pointer"
                : "text-muted-foreground/30 cursor-not-allowed"
            }`}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            onClick={onRedo}
            disabled={!canRedo}
            className={`p-1.5 rounded transition-colors ${
              canRedo
                ? "text-muted-foreground hover:text-foreground hover:bg-muted/70 cursor-pointer"
                : "text-muted-foreground/30 cursor-not-allowed"
            }`}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          {selectedCaptionId && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 px-2.5 py-1 ml-1 rounded text-xs font-medium text-destructive hover:bg-destructive/15 transition-colors"
              title="Delete selected subtitle (Del)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          )}
        </div>

        {/* Center: Skip back, Play/Pause, Skip forward, Timecode */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSkipBack}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            title="Skip back 5s"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={togglePlay}
            className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center hover:opacity-90 transition-opacity shadow-sm"
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
          </button>

          <button
            onClick={handleSkipForward}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            title="Skip forward 5s"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          {/* Timecode formatted as mm:ss.f / mm:ss.f */}
          <div className="font-mono text-xs text-muted-foreground font-medium tracking-tight ml-1">
            <span className="text-foreground">{formatVeedTime(currentTimeMs)}</span>
            <span className="mx-1 text-muted-foreground/60">/</span>
            <span>{formatVeedTime(durationMs)}</span>
          </div>
        </div>

        {/* Right: Zoom controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom((z) => Math.max(0.3, Number((z - 0.2).toFixed(1))))}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <input
            type="range"
            min="0.3"
            max="3.5"
            step="0.1"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-20 accent-primary cursor-pointer h-1 bg-muted rounded-lg"
            title={`Zoom: ${(zoom * 100).toFixed(0)}%`}
          />

          <button
            onClick={() => setZoom((z) => Math.min(3.5, Number((z + 0.2).toFixed(1))))}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleFitZoom}
            className="px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 rounded transition-colors"
            title="Fit to Window"
          >
            Fit
          </button>
        </div>
      </div>

      {/* ── TRACKS CANVAS (Theme adaptive, starting from 0s) ────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden relative custom-scrollbar bg-background"
      >
        <div
          style={{ width: `${contentWidth}px`, minHeight: "100%" }}
          className="relative h-full flex flex-col"
          onClick={(e) => {
            // Clicking empty canvas seeks and returns to Global Styles mode
            if (!scrollRef.current) return;
            const rect = scrollRef.current.getBoundingClientRect();
            const clickX = e.clientX - rect.left + scrollRef.current.scrollLeft;
            const ms = Math.max(0, Math.min(clickX / pxPerMs, durationMs));
            seekToMs(ms);
            onSelectCaption(null);
          }}
        >
          {/* 1. Time Ruler */}
          <div
            className="h-6 border-b border-border bg-muted/25 relative cursor-pointer flex-shrink-0"
            onMouseDown={handleRulerMouseDown}
          >
            {Array.from({ length: totalTicks }).map((_, i) => {
              const tickSec = i * tickStepSec;
              const leftPx = tickSec * 1000 * pxPerMs;
              if (leftPx > contentWidth + 50) return null;

              return (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-l border-border/60 pl-1 flex items-center pointer-events-none"
                  style={{ left: `${leftPx}px` }}
                >
                  <span className="text-[10px] font-mono text-muted-foreground leading-none">
                    {formatRulerTick(tickSec)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 2. Track 1: Subtitle Segments (Purple rounded clips) */}
          <div className="h-9 relative my-1 flex items-center flex-shrink-0">
            {captions.map((seg, idx) => {
              const segId = seg.id || `seg-${idx}`;
              const isSelected = selectedCaptionId === segId || (Boolean(seg.id) && selectedCaptionId === seg.id);
              const leftPx = seg.startMs * pxPerMs;
              const rawWidth = (seg.endMs - seg.startMs) * pxPerMs;
              const clipWidth = Math.max(14, rawWidth - 2);

              return (
                <div
                  key={segId}
                  className={`group absolute top-0.5 bottom-0.5 rounded-[5px] overflow-hidden cursor-pointer select-none transition-all flex items-center ${
                    isSelected
                      ? "bg-[#8B5CF6] ring-2 ring-primary border border-white/80 shadow-md brightness-105 z-20"
                      : "bg-[#7C3AED]/90 hover:bg-[#8B5CF6] border border-purple-400/20 hover:brightness-105 z-10"
                  }`}
                  style={{
                    left: `${leftPx}px`,
                    width: `${clipWidth}px`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectCaption(segId);
                    seekToMs(seg.startMs);
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onSelectCaption(segId);
                    seekToMs(seg.startMs);
                    if (e.button === 0) {
                      initialCaptionsRef.current = [...captions].sort((a, b) => a.startMs - b.startMs);
                      setDraggingSeg({
                        id: segId,
                        type: "move",
                        startX: e.clientX,
                        startVal: seg.startMs,
                        origDuration: seg.endMs - seg.startMs,
                      });
                    }
                  }}
                  title={`[#${idx + 1}] ${seg.text} (${((seg.endMs - seg.startMs) / 1000).toFixed(1)}s)`}
                >
                  {/* Left trim handle */}
                  {isSelected && (
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        initialCaptionsRef.current = [...captions].sort((a, b) => a.startMs - b.startMs);
                        setDraggingSeg({
                          id: segId,
                          type: "left",
                          startX: e.clientX,
                          startVal: seg.startMs,
                          origDuration: seg.endMs - seg.startMs,
                        });
                      }}
                      className="absolute left-0 top-0 bottom-0 w-1.5 bg-white rounded-l cursor-col-resize z-30 flex items-center justify-center hover:w-2 transition-all shadow-sm"
                      title="Trim start"
                    />
                  )}

                  {/* Subtitle text preview inside purple pill */}
                  <div className="w-full px-2 overflow-hidden flex items-center">
                    <span className="text-[11px] font-medium text-white truncate drop-shadow-sm">
                      {seg.text}
                    </span>
                  </div>

                  {/* Right trim handle */}
                  {isSelected && (
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        initialCaptionsRef.current = [...captions].sort((a, b) => a.startMs - b.startMs);
                        setDraggingSeg({
                          id: segId,
                          type: "right",
                          startX: e.clientX,
                          startVal: seg.endMs,
                          origDuration: seg.endMs - seg.startMs,
                        });
                      }}
                      className="absolute right-0 top-0 bottom-0 w-1.5 bg-white rounded-r cursor-col-resize z-30 flex items-center justify-center hover:w-2 transition-all shadow-sm"
                      title="Trim end (ripple)"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* 3. Track 2: Video Filmstrip (Clean without decorative circular markers) */}
          <div className="h-6 relative mb-1 mx-0.5 rounded overflow-hidden bg-muted/50 border border-border/50 flex items-center flex-shrink-0">
            <div className="absolute inset-0 flex opacity-75">
              {Array.from({ length: Math.ceil(contentWidth / 44) }).map((_, fIdx) => (
                <div
                  key={fIdx}
                  className="w-11 h-full border-r border-border/40 bg-muted/20"
                />
              ))}
            </div>
          </div>

          {/* 4. Track 3: Audio Waveform (Vibrant blue waveform bars) */}
          <div className="h-6 relative mx-0.5 rounded overflow-hidden bg-sky-950/15 dark:bg-sky-950/40 border border-sky-500/20 flex items-center flex-shrink-0">
            <svg
              className="w-full h-full text-[#0ea5e9]"
              preserveAspectRatio="none"
              viewBox={`0 0 ${waveformBarCount * 4} 24`}
            >
              {Array.from({ length: waveformBarCount }).map((_, bIdx) => {
                const norm = bIdx / waveformBarCount;
                const waveHeight =
                  Math.max(3, Math.min(22, 10 + 9 * Math.sin(norm * 32) * Math.cos(norm * 14) + 4 * Math.sin(norm * 70)));
                const y = (24 - waveHeight) / 2;
                return (
                  <rect
                    key={bIdx}
                    x={bIdx * 4}
                    y={y}
                    width={2.5}
                    height={waveHeight}
                    rx={1}
                    fill="currentColor"
                    opacity={0.9}
                  />
                );
              })}
            </svg>
          </div>

          {/* 5. Playhead: Downward triangle marker + needle cutting through all tracks */}
          <div
            style={{
              left: `${currentTimeMs * pxPerMs}px`,
              transform: "translateX(-50%)",
            }}
            className="absolute top-0 bottom-0 pointer-events-none z-40 transition-none flex flex-col items-center"
          >
            {/* Playhead Downward Triangle Marker */}
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-foreground drop-shadow-sm -mt-0.5" />
            {/* Playhead vertical line */}
            <div className="w-[1.5px] h-full bg-foreground drop-shadow-sm" />
          </div>
        </div>
      </div>
    </div>
  );
};
