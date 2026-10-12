import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig, delayRender, continueRender, staticFile } from "remotion";
import { useEffect, useState } from "react";

import type { Caption, CaptionPosition, CaptionStyle, EmphasisMap } from "../../modules/styles/types";
import { EngineRenderer } from "./EngineRenderer";
import { getSafeBoundingBoxPadding, preloadFonts, getStyle } from "../styles/presetRegistry";

export type CaptionPage = {
  id?: string | undefined;
  startMs: number;
  endMs: number;
  tokens: { text: string; fromMs: number; toMs: number; index: number }[];
  styleOverrides?: any;
};

/** Group word captions into pages of `wordsPerLine`, keeping global indices. */
export function buildPages(captions: Caption[], wordsPerLine: number): CaptionPage[] {
  const pages: CaptionPage[] = [];
  let globalWordIndex = 0;
  for (const segment of captions) {
    const tokens: CaptionPage["tokens"] = [];
    if (segment.words && segment.words.length > 0) {
      for (const w of segment.words) {
        tokens.push({ text: w.text, fromMs: w.startMs, toMs: w.endMs, index: globalWordIndex++ });
      }
    } else {
      // Fallback: treat the whole segment text as a single token, or split it evenly?
      // Since it's a segment, we'll split it by space and assign even timing for animation purposes
      const words = segment.text.trim().split(/\s+/).filter(Boolean);
      const durationMs = segment.endMs - segment.startMs;
      const msPerWord = words.length > 0 ? durationMs / words.length : durationMs;
      for (let j = 0; j < words.length; j++) {
        tokens.push({
          text: words[j] || "",
          fromMs: segment.startMs + j * msPerWord,
          toMs: segment.startMs + (j + 1) * msPerWord,
          index: globalWordIndex++
        });
      }
    }
    pages.push({
      id: segment.id,
      startMs: segment.startMs,
      endMs: segment.endMs,
      tokens,
      styleOverrides: segment.styleOverrides,
    });
  }
  return pages;
}

function getClosestMask(masks: Record<number, string>, targetFrame: number): string | undefined {
  if (masks[targetFrame]) return masks[targetFrame];
  for (let delta = 1; delta <= 3; delta++) {
    if (masks[targetFrame - delta]) return masks[targetFrame - delta];
    if (masks[targetFrame + delta]) return masks[targetFrame + delta];
  }
  return undefined;
}

export type CaptionedVideoProps = {
  videoSrc: string | null;
  captions: Caption[];
  emphasis: EmphasisMap;
  style: CaptionStyle;
  position: CaptionPosition;
  wordsPerLine: number;
  styleOverrides?: any;
  behindHeadMasks?: Record<number, string>;
};

export const CaptionedVideo: React.FC<CaptionedVideoProps> = ({
  videoSrc,
  captions,
  emphasis,
  style,
  position,
  wordsPerLine,
  styleOverrides,
  behindHeadMasks,
}) => {
  const [fontHandle] = useState(() => delayRender("Loading fonts"));
  useEffect(() => {
    preloadFonts().then(() => {
      continueRender(fontHandle);
    }).catch(() => continueRender(fontHandle));
  }, [fontHandle]);

  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const timeMs = (frame / fps) * 1000;

  const pages = buildPages(captions, wordsPerLine);
  const page = pages.find((p) => timeMs >= p.startMs - 120 && timeMs <= p.endMs + 400);

  // Base size: ~10cqw handles 4 words filling ~60-75% width
  const baseFontCqw = 10 * (position.sizeMultiplier || 1.0);

  // Text alignment — respect styleOverrides.align
  const alignOverride = page?.styleOverrides?.align || styleOverrides?.align;
  const isMixed = style.engine === "mixed-type" && style.mixedTokens;
  const baseTextAlign = isMixed && style.mixedTokens?.layout === "stack-left" ? "left" : "center";
  const textAlign = alignOverride || baseTextAlign;
  const alignItems =
    textAlign === "left" ? "flex-start" : textAlign === "right" ? "flex-end" : "center";

  const autoAccent = styleOverrides?.autoAccent ?? true;

  const effectiveStyleOverrides = {
    ...styleOverrides,
    ...(position.lineSpacing !== undefined ? { lineSpacing: position.lineSpacing } : {}),
    ...(page?.styleOverrides || {}),
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      {/* Layer 1: Background Video */}
      {videoSrc ? <OffthreadVideo src={videoSrc.startsWith("temp-") ? staticFile(videoSrc) : videoSrc} style={{ width, height, objectFit: "cover" }} /> : null}

      {/* Layer 2: Caption text layer */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          containerType: "inline-size",
          pointerEvents: "none",
          zIndex: 5,
        }}
      >
        {page ? (
          (() => {
            const mergedOverrides = {
              ...effectiveStyleOverrides,
              ...(page.styleOverrides || {}),
            };
            const pos = mergedOverrides.position || position;
            const effectiveBaseFontCqw = 10 * (pos.sizeMultiplier || position.sizeMultiplier || 1.0);
            const align = mergedOverrides.align || textAlign;
            const alignIt = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";

            const effectiveStyle = mergedOverrides.styleId ? getStyle(mergedOverrides.styleId) : style;

            return (
              <div
                style={{
                  position: "absolute",
                  left: `${pos.xPercent}%`,
                  top: `${pos.yPercent}%`,
                  width: pos.isManualSizing ? `${pos.widthPercent}%` : "fit-content",
                  maxWidth: pos.isManualSizing ? "100%" : `${pos.widthPercent}%`,
                  height: (pos.isManualSizing && pos.heightPercent) ? `${pos.heightPercent}%` : "auto",
                  minHeight: "fit-content",
                  transform: `translate(-50%, -50%)${pos.rotateDeg ? ` rotate(${pos.rotateDeg}deg)` : ""}`,
                  textAlign: align as any,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: alignIt,
                  justifyContent: "center",
                  padding: getSafeBoundingBoxPadding(effectiveStyle.mixedTokens || effectiveStyle.tokens, mergedOverrides),
                  boxSizing: "border-box",
                  borderRadius: "4px",
                  fontSize: `${effectiveBaseFontCqw}cqw`,
                  overflow: "visible",
                }}
              >
                <div
                  key={page.startMs}
                  style={{
                    width: "100%",
                    height: (pos.isManualSizing && pos.heightPercent) ? "100%" : "auto",
                    overflow: "visible",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: alignIt,
                    justifyContent: "center",
                  }}
                >
                  <EngineRenderer
                    page={page}
                    style={effectiveStyle}
                    emphasis={emphasis}
                    baseFontCqw={effectiveBaseFontCqw}
                    autoAccent={autoAccent}
                    styleOverrides={mergedOverrides}
                  />
                </div>
              </div>
            );
          })()
        ) : null}
      </div>

      {/* Layer 3: Foreground Head & Hair Mask Layer (when Behind Head is active and caption is visible) */}
      {(() => {
        if (!page) return null;
        const isBehindHead =
          page.styleOverrides?.behindHead !== undefined
            ? Boolean(page.styleOverrides.behindHead)
            : Boolean(styleOverrides?.behindHead);
        if (!isBehindHead || !videoSrc || !behindHeadMasks) return null;
        const maskSrc = behindHeadMasks[frame] || getClosestMask(behindHeadMasks, frame);
        if (!maskSrc) return null;

        return (
          <div
            style={{
              position: "absolute",
              inset: 0,
              WebkitMaskImage: `url(${maskSrc})`,
              maskImage: `url(${maskSrc})`,
              WebkitMaskSize: "cover",
              maskSize: "cover",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              zIndex: 10,
              pointerEvents: "none",
            }}
          >
            <OffthreadVideo
              src={videoSrc.startsWith("temp-") ? staticFile(videoSrc) : videoSrc}
              style={{ width, height, objectFit: "cover" }}
            />
          </div>
        );
      })()}
    </AbsoluteFill>
  );
};








