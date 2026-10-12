import React, { useRef, useState, useEffect } from "react";
import { BaseEngineRenderer } from "./EngineRenderer";
import type { CaptionStyle, EmphasisMap } from "../../modules/styles/types";

export type StylePosterProps = {
  style: CaptionStyle;
  sampleText: string;
  width: number;
  height: number;
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "is",
  "are",
  "to",
  "for",
  "of",
  "in",
  "on",
  "at",
  "by",
  "se",
  "hai",
  "ka",
  "ke",
  "ki",
  "ko",
]);

const VIRTUAL_WIDTH = 280;
const VIRTUAL_HEIGHT = 175; // Exactly 16:10 aspect ratio (280 / 1.6 = 175)

export const StylePoster: React.FC<StylePosterProps> = ({ style, sampleText }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(135 / VIRTUAL_WIDTH);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth || el.offsetWidth;
      if (w > 0) {
        setScale(w / VIRTUAL_WIDTH);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Extract a clean 3 to 5 word sample to prevent overcrowding and clipping
  const rawTokens = (sampleText || "Keep your story moving")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const words =
    rawTokens.length > 5
      ? rawTokens.slice(0, 5)
      : rawTokens.length < 3
      ? [...rawTokens, "Story", "Pop"].slice(0, 4)
      : rawTokens;

  const page = {
    startMs: 0,
    endMs: 3000,
    tokens: words.map((w, i) => ({
      text: w,
      fromMs: i * 500,
      toMs: (i + 1) * 500,
      index: i,
    })),
  };

  // Designate active (spoken/karaoke highlight) and accent (emphasis/catchy) words
  // so that all distinct visual treatments of the style preset are showcased cleanly.
  const activeIndex = words.length > 1 ? 1 : 0;
  let emphasisIndex = words.length > 2 ? 2 : (words.length > 1 ? 1 : 0);

  // Search for the best content word (non-stopword) that is distinct from activeIndex
  for (let i = 0; i < words.length; i++) {
    if (i !== activeIndex && !STOP_WORDS.has(words[i]!.toLowerCase()) && words[i]!.length >= 3) {
      emphasisIndex = i;
      break;
    }
  }

  const emphasis: EmphasisMap = {
    [String(emphasisIndex)]: 3,
  };

  // Adaptive font scaling in container-query units (cqw) relative to 90% of VIRTUAL_WIDTH (252px).
  // In a 252px container: 1 cqw = 2.52px.
  // Standard (9.5 cqw) evaluates to ~24px, ensuring glyph strokes, shadows, and outlines
  // render with crystal-clear vector sharpness before smooth GPU downscaling.
  let baseFontCqw = 9.5;
  if (style.engine === "mixed-type") {
    // Mixed-type accent words scale by 1.7x–2.2x; 8.2 cqw (20.7px base, ~37–45px accent)
    // allows script ascenders and descenders to fit cleanly without vertical clipping
    baseFontCqw = 8.2;
  } else if (style.engine === "editorial-stack") {
    // Stacked layout places words on separate vertical lines
    baseFontCqw = 7.2;
  } else if (style.tokens?.uppercase) {
    // Condensed uppercase fonts (Bangers, Anton, Bebas) need solid glyph width
    baseFontCqw = 9.6;
  }

  // Adjust for unusually long single words to prevent horizontal touching
  const maxWordLen = Math.max(...words.map((w) => w.length));
  if (maxWordLen >= 9) {
    baseFontCqw = Math.min(baseFontCqw, 8.0);
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "transparent",
        pointerEvents: "none",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: VIRTUAL_WIDTH,
          height: VIRTUAL_HEIGHT,
          flexShrink: 0,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "90%",
            maxWidth: "90%",
            containerType: "inline-size",
            display: "flex",
            flexDirection: "column",
            alignItems: style.mixedTokens?.layout === "stack-left" ? "flex-start" : "center",
            justifyContent: "center",
            textAlign: style.mixedTokens?.layout === "stack-left" ? "left" : "center",
            overflow: "visible",
          }}
        >
          <BaseEngineRenderer
            page={page}
            style={style}
            emphasis={emphasis}
            baseFontCqw={baseFontCqw}
            autoAccent={true}
            posterState={{ activeIndex }}
          />
        </div>
      </div>
    </div>
  );
};
