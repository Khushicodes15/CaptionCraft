import React, { useEffect, useState, useRef } from "react";
import type { Caption, CaptionPosition, CaptionStyle, EmphasisMap } from "../../modules/styles/types";
import { BaseEngineRenderer } from "./EngineRenderer";
import { buildPages } from "./CaptionedVideo";
import { getSafeBoundingBoxPadding, preloadFonts, getStyle } from "../styles/presetRegistry";

// Map style animation name → CSS keyframe name + duration
function getCssAnimation(animation: string | undefined, entrance: string | undefined): string {
  const anim = animation || entrance || "none";
  switch (anim) {
    case "normal":
      return "capNormal 0.25s ease-out both";
    case "fade":
      return "capFade 0.3s ease-out both";
    case "rise":
      return "capRise 0.35s ease-out both";
    case "pop":
      return "capPop 0.35s cubic-bezier(0.34,1.56,0.64,1) both";
    case "typewriter":
    case "write":
      return "none"; // handled per-word
    default:
      return "none"; // "none" or unknown
  }
}

export type CaptionOverlayProps = {
  currentTimeMs: number;
  captions: Caption[];
  emphasis: EmphasisMap;
  style: CaptionStyle;
  position: CaptionPosition;
  wordsPerLine: number;
  videoWidth: number;
  videoHeight: number;
  autoAccent?: boolean;
  styleState?: any; // To pass overrides
  onPositionChange?: ((newPosition: CaptionPosition, id?: string) => void) | undefined;
  onWordsPerLineChange?: ((newWpl: number) => void) | undefined;
  onScaleChange?: ((scaleDelta: number) => void) | undefined;
  onDragStart?: (() => void) | undefined;
  onSelected?: ((id?: string | null) => void) | undefined;
  isSelected?: boolean | undefined;
  selectedCaptionId?: string | null | undefined;
  positionScope?: "all" | "segment";
};

export const CaptionOverlay: React.FC<CaptionOverlayProps> = ({
  currentTimeMs,
  captions,
  emphasis,
  style,
  position,
  wordsPerLine,
  videoWidth,
  videoHeight,
  autoAccent = true,
  styleState,
  onPositionChange,

  onDragStart,
  onSelected,
  isSelected,
  selectedCaptionId,
  positionScope = "all",
}) => {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<"left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | false>(false);
  const [localPos, setLocalPos] = useState<CaptionPosition | null>(null);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef<"left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | false>(false);
  const localPosRef = useRef<CaptionPosition | null>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const draggedSegmentId = useRef<string | null>(null);

  const initialPosition = useRef(position);
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    preloadFonts().then(() => setFontsLoaded(true));
  }, []);

  const pages = buildPages(captions, wordsPerLine);
  const activeTimePage = pages.find(
    (p) => currentTimeMs >= p.startMs - 120 && currentTimeMs <= p.endMs + 400,
  );
  // Auto-select subtitle of the explicitly selected segment
  const selectedPage = selectedCaptionId ? pages.find((p) => p.id === selectedCaptionId) : null;
  const page = selectedPage || activeTimePage;

  useEffect(() => {
    if (!isDragging && !isResizing && !isDraggingRef.current && !isResizingRef.current) {
      setLocalPos(null);
      localPosRef.current = null;
      draggedSegmentId.current = null;
    }
  }, [page?.id, position, isDragging, isResizing]);

  if (!fontsLoaded) return null;

  const isThisSelected = Boolean(
    (selectedCaptionId && page?.id === selectedCaptionId) ||
    (!selectedCaptionId && isSelected)
  );

  // Isolate active drag/resize strictly to this specific segment, or to all captions when in global scope
  const isActivelyModifyingThis =
    (isDragging || isResizing || isDraggingRef.current || Boolean(isResizingRef.current)) &&
    (localPos !== null || localPosRef.current !== null) &&
    (positionScope === "all" || draggedSegmentId.current === page?.id || (!draggedSegmentId.current && isThisSelected));

  const segmentOverridePos = page?.styleOverrides?.position as CaptionPosition | undefined;
  // If editing in global scope, basePos is the global position; in segment scope or playback, respect override if present
  const basePos = (isThisSelected && positionScope === "all")
    ? position
    : (segmentOverridePos || position);

  const activePos = isActivelyModifyingThis && (localPos || localPosRef.current)
    ? (localPos || localPosRef.current)!
    : basePos;

  const fps = 30;
  const currentFrame = (currentTimeMs / 1000) * fps;
  const baseFontCqw = 10 * (activePos.sizeMultiplier || 1.0);

  const borderStyle = isThisSelected ? "2px solid #00c4cc" : "2px solid transparent";

  // Effective style (inheriting preset override if segment has one)
  const effectiveStyle = page?.styleOverrides?.styleId ? getStyle(page.styleOverrides.styleId) : style;

  // Text alignment — respect styleOverrides.align
  const alignOverride = page?.styleOverrides?.align || styleState?.align;
  const isMixed = effectiveStyle.engine === "mixed-type" && effectiveStyle.mixedTokens;
  const baseTextAlign = isMixed && effectiveStyle.mixedTokens?.layout === "stack-left" ? "left" : "center";
  const textAlign = alignOverride || baseTextAlign;
  const alignItems =
    textAlign === "left" ? "flex-start" : textAlign === "right" ? "flex-end" : "center";

  const effectiveStyleOverrides = {
    ...styleState,
    ...(activePos.lineSpacing !== undefined ? { lineSpacing: activePos.lineSpacing } : {}),
    ...(page?.styleOverrides || {}),
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const targetId = positionScope === "all" ? null : (page?.id || selectedCaptionId || null);
    draggedSegmentId.current = targetId;
    onSelected?.(page?.id || selectedCaptionId);
    if (!onPositionChange) return;

    let physW = activePos.widthPercent;
    let physH = activePos.heightPercent || 20;

    const parentEl = containerRef.current?.parentElement || containerRef.current;
    const parentRect = parentEl?.getBoundingClientRect();

    const boxEl = boxRef.current;
    if (boxEl && parentRect && parentRect.width > 0 && parentRect.height > 0) {
      const rect = boxEl.getBoundingClientRect();
      physW = (rect.width / parentRect.width) * 100;
      physH = (rect.height / parentRect.height) * 100;
    }

    const startW = (activePos.isManualSizing && activePos.widthPercent) ? activePos.widthPercent : physW;
    const startH = (activePos.isManualSizing && activePos.heightPercent) ? activePos.heightPercent : physH;

    initialPosition.current = {
      ...activePos,
      _startW: startW,
      _startH: startH,
      _physicalWidthPercent: physW,
      _physicalHeightPercent: physH,
    } as any;
    dragStartPos.current = { x: e.clientX, y: e.clientY };

    const target = e.target as HTMLElement;
    const resizeTarget = target.closest("[data-resize]") as HTMLElement | null;
    if (resizeTarget?.dataset["resize"]) {
      const resizeType = resizeTarget.dataset["resize"] as any;
      isResizingRef.current = resizeType;
      setIsResizing(resizeType);
    } else {
      isDraggingRef.current = true;
      setIsDragging(true);
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const currentResizing = isResizingRef.current || isResizing;
    const currentDragging = isDraggingRef.current || isDragging;
    if (!currentDragging && !currentResizing) return;
    if (!onPositionChange) return;

    const startW = (initialPosition.current as any)._startW ?? (initialPosition.current.isManualSizing ? initialPosition.current.widthPercent : ((initialPosition.current as any)._physicalWidthPercent || initialPosition.current.widthPercent));
    const startH = (initialPosition.current as any)._startH ?? (initialPosition.current.isManualSizing && initialPosition.current.heightPercent ? initialPosition.current.heightPercent : ((initialPosition.current as any)._physicalHeightPercent || 20));
    const startX = initialPosition.current.xPercent;
    const startY = initialPosition.current.yPercent;
    
    let scaleX = 1080;
    let scaleY = 1920;
    const parentEl = containerRef.current?.parentElement || containerRef.current;
    if (parentEl) {
      const rect = parentEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        scaleX = rect.width;
        scaleY = rect.height;
      }
    }
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    const dxPercent = (dx / scaleX) * 100;
    const dyPercent = (dy / scaleY) * 100;

    const {
      _startW,
      _startH,
      _physicalWidthPercent,
      _physicalHeightPercent,
      ...cleanBase
    } = initialPosition.current as any;

    if (currentDragging) {
      let nX = startX + dxPercent;
      let nY = startY + dyPercent;
      const hw = startW / 2;
      const hh = startH / 2;
      const minX = Math.min(hw, 100 - hw);
      const maxX = Math.max(hw, 100 - hw);
      const minY = Math.min(hh, 100 - hh);
      const maxY = Math.max(hh, 100 - hh);
      nX = Math.max(minX, Math.min(maxX, nX));
      nY = Math.max(minY, Math.min(maxY, nY));
      
      const newPos: CaptionPosition = {
        ...cleanBase,
        xPercent: nX,
        yPercent: nY,
      };
      localPosRef.current = newPos;
      setLocalPos(newPos);
    } else if (currentResizing) {
      const isLeft = currentResizing.includes("left");
      const isRight = currentResizing.includes("right");
      const isTop = currentResizing.includes("top");
      const isBottom = currentResizing.includes("bottom");

      let newW = startW;
      let newH = startH;
      let newX = startX;
      let newY = startY;

      if (isRight) {
        const leftEdge = startX - startW / 2;
        const maxW = Math.max(5, 100 - leftEdge);
        newW = Math.max(5, Math.min(maxW, startW + dxPercent));
        newX = leftEdge + newW / 2;
      } else if (isLeft) {
        const rightEdge = startX + startW / 2;
        const maxW = Math.max(5, rightEdge);
        newW = Math.max(5, Math.min(maxW, startW - dxPercent));
        newX = rightEdge - newW / 2;
      }

      if (isBottom) {
        const topEdge = startY - startH / 2;
        const maxH = Math.max(3, 100 - topEdge);
        newH = Math.max(3, Math.min(maxH, startH + dyPercent));
        newY = topEdge + newH / 2;
      } else if (isTop) {
        const bottomEdge = startY + startH / 2;
        const maxH = Math.max(3, bottomEdge);
        newH = Math.max(3, Math.min(maxH, startH - dyPercent));
        newY = bottomEdge - newH / 2;
      }

      const isVerticalResize = isTop || isBottom;
      const finalHeightPercent = isVerticalResize
        ? newH
        : initialPosition.current.heightPercent;

      const newPos: CaptionPosition = {
        ...cleanBase,
        isManualSizing: true,
        widthPercent: newW,
        ...(finalHeightPercent !== undefined ? { heightPercent: finalHeightPercent } : {}),
        xPercent: newX,
        yPercent: newY,
      };
      localPosRef.current = newPos;
      setLocalPos(newPos);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    isResizingRef.current = false;
    setIsDragging(false);
    setIsResizing(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    const finalPos = localPosRef.current || localPos;
    if (finalPos) {
      const targetId = positionScope === "all" ? null : (draggedSegmentId.current || selectedCaptionId || page?.id);
      onPositionChange?.(finalPos, targetId || undefined);
    }
    localPosRef.current = null;
    setLocalPos(null);
    draggedSegmentId.current = null;
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "visible",
        containerType: "inline-size",
      }}
    >
      {page ? (
        <div
          ref={boxRef}
          data-caption-box="true"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={(e) => {
            e.stopPropagation();
            onSelected?.(page?.id || selectedCaptionId);
          }}
          style={{
            position: "absolute",
            left: `${activePos.xPercent}%`,
            top: `${activePos.yPercent}%`,
            width: activePos.isManualSizing ? `${activePos.widthPercent}%` : "fit-content",
            maxWidth: activePos.isManualSizing ? "100%" : `${activePos.widthPercent}%`,
            height: (activePos.isManualSizing && activePos.heightPercent) ? `${activePos.heightPercent}%` : "auto",
            minHeight: "fit-content",
            transform: "translate(-50%, -50%)",
            textAlign: textAlign as any,
            display: "flex",
            flexDirection: "column", 
            alignItems,
            justifyContent: "center",
            cursor: "move",
            border: borderStyle,
            padding: getSafeBoundingBoxPadding(style.mixedTokens || style.tokens, effectiveStyleOverrides),
            boxSizing: "border-box",
            borderRadius: "4px",
            transition: "border 0.2s ease",
            pointerEvents: "auto",
            touchAction: "none",
            userSelect: "none",
            fontSize: `${baseFontCqw}cqw`,
            overflow: "visible",
          }}
        >
          {/* CSS animation wrapper — remounts each new page to re-trigger keyframe */}
          <div
              key={page.startMs}
              style={{
                width: "100%",
                height: (activePos.isManualSizing && activePos.heightPercent) ? "100%" : "auto",
                overflow: "visible",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
                display: "flex",
                flexDirection: "column", 
                alignItems: alignItems,
                justifyContent: "center",
                animation: (isThisSelected || styleState?.animationScope === "word")
                  ? "none"
                  : getCssAnimation(
                      styleState?.animation,
                      style.mixedTokens?.entrance ?? style.tokens?.entrance,
                    ),
            }}
          >
            <BaseEngineRenderer
              page={page}
              style={effectiveStyle}
              emphasis={emphasis}
              baseFontCqw={baseFontCqw}
              autoAccent={autoAccent}
              frame={currentFrame}
              fps={fps}
              styleOverrides={effectiveStyleOverrides}
              isEditing={isThisSelected}
            />
          </div>

          {/* Resize handles */}
          {isThisSelected && (
            <>
              <div
                data-resize="left"
                style={{
                  position: "absolute",
                  left: "-4px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: "8px",
                  height: "24px",
                  backgroundColor: "#00c4cc",
                  borderRadius: "4px",
                  cursor: "ew-resize",
                  zIndex: 20,
                }}
              />
              <div
                data-resize="right"
                style={{
                  position: "absolute",
                  right: "-4px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: "8px",
                  height: "24px",
                  backgroundColor: "#00c4cc",
                  borderRadius: "4px",
                  cursor: "ew-resize",
                  zIndex: 20,
                }}
              />
              <div data-resize="top-left" style={{ position: "absolute", left: "-6px", top: "-6px", width: "12px", height: "12px", backgroundColor: "#00c4cc", borderRadius: "50%", cursor: "nwse-resize", zIndex: 20 }} />
              <div data-resize="top-right" style={{ position: "absolute", right: "-6px", top: "-6px", width: "12px", height: "12px", backgroundColor: "#00c4cc", borderRadius: "50%", cursor: "nesw-resize", zIndex: 20 }} />
              <div data-resize="bottom-left" style={{ position: "absolute", left: "-6px", bottom: "-6px", width: "12px", height: "12px", backgroundColor: "#00c4cc", borderRadius: "50%", cursor: "nesw-resize", zIndex: 20 }} />
              <div data-resize="top" style={{ position: "absolute", left: "50%", top: "-6px", width: "12px", height: "12px", backgroundColor: "#00c4cc", borderRadius: "50%", cursor: "ns-resize", transform: "translateX(-50%)", zIndex: 20 }} />
              <div data-resize="bottom" style={{ position: "absolute", left: "50%", bottom: "-6px", width: "12px", height: "12px", backgroundColor: "#00c4cc", borderRadius: "50%", cursor: "ns-resize", transform: "translateX(-50%)", zIndex: 20 }} />
              <div data-resize="bottom-right" style={{ position: "absolute", right: "-6px", bottom: "-6px", width: "12px", height: "12px", backgroundColor: "#00c4cc", borderRadius: "50%", cursor: "nwse-resize", zIndex: 20 }} />

              {/* Scope Indicator Badge */}
              <div
                style={{
                  position: "absolute",
                  top: "-24px",
                  left: "0",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  backgroundColor: positionScope === "all" ? "rgba(14, 165, 233, 0.95)" : "rgba(168, 85, 247, 0.95)",
                  color: "#ffffff",
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: "4px",
                  pointerEvents: "none",
                  boxShadow: "0 2px 5px rgba(0,0,0,0.35)",
                  whiteSpace: "nowrap",
                  lineHeight: "14px",
                  zIndex: 25,
                  userSelect: "none",
                  letterSpacing: "0.02em",
                }}
              >
                <span>{positionScope === "all" ? "🌐 All Captions" : "🎯 This Segment"}</span>
                {positionScope === "segment" && segmentOverridePos && (
                  <span style={{ opacity: 0.8, fontSize: "9px" }}>(Override)</span>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};























































