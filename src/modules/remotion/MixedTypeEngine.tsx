/**
 * MixedTypeEngine — renders the "typographic collage" look.
 *
 * Rules:
 * - Max 2 font families per style.
 * - Each line gets at most ONE accent word.
 * - READING ORDER IS SACRED. Overlap is done with negative margins only.
 * - Script/thin-serif accents get a minimum size of 1.8× base.
 * - If accent word overflows 85% of container, it scales down to fit.
 * - Words per line: 2â€“4, max 3 lines.
 * - Pills (Editorial Rose only) apply only to short stopwords (≤3 letters), never accent.
 */
import React from "react";
import type { MixedTypeTokens, TextCase, EmphasisMap } from "../../modules/styles/types";
import type { CaptionPage } from "./CaptionedVideo";
import { interpolate, spring } from "remotion";

// â”€â”€ Stopwords for auto-accent and pills â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "is",
  "are",
  "was",
  "were",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "by",
  "it",
  "its",
  "if",
  "so",
  "as",
  "be",
  "do",
  "no",
  "my",
  "me",
  "we",
  "he",
  "she",
  "up",
  "am",
  "not",
  "how",
  "all",
  "has",
]);

export function isStopword(word: string): boolean {
  return STOP_WORDS.has(word.toLowerCase());
}

function isPillWord(word: string): boolean {
  return word.length <= 3 || isStopword(word);
}

// â”€â”€ Text case helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function applyCase(text: string, textCase: TextCase): string {
  switch (textCase) {
    case "lower":
      return text.toLowerCase();
    case "upper":
      return text.toUpperCase();
    case "title":
      return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    case "sentence":
      return text; // keep as-is from transcription
    default:
      return text;
  }
}

// â”€â”€ Line splitting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type TokenWithMeta = {
  text: string;
  index: number;
  fromMs: number;
  toMs: number;
  isAccent: boolean;
};

/**
 * Split tokens into lines of 2â€“4 words, max 3 lines.
 * Each line gets at most one accent word.
 */
export function splitIntoLines(
  tokens: CaptionPage["tokens"],
  emphasis: EmphasisMap,
  autoAccent: boolean,
  lineBreakMode?: "auto" | "every-word" | "accent-isolated" | "news-blocks",
): TokenWithMeta[][] {
  // Determine which token is accent
  let accentIndex = -1;

  // User emphasis always wins
  let highestLevel = 0;
  for (const t of tokens) {
    const level = emphasis[String(t.index)] ?? 0;
    if (level > highestLevel) {
      highestLevel = level;
      accentIndex = t.index;
    }
  }

  // Auto-accent: pick longest non-stopword if no user emphasis
  if (accentIndex === -1 && autoAccent) {
    let longestLen = 0;
    for (const t of tokens) {
      if (!isStopword(t.text) && t.text.length > longestLen) {
        longestLen = t.text.length;
        accentIndex = t.index;
      }
    }
  }

  const metas: TokenWithMeta[] = tokens.map((t) => ({
    text: t.text,
    index: t.index,
    fromMs: t.fromMs,
    toMs: t.toMs,
    isAccent: highestLevel > 0 ? (emphasis[String(t.index)] ?? 0) > 0 : t.index === accentIndex,
  }));

  const totalWords = metas.length;

  if (lineBreakMode === "every-word") {
    return metas.map((m) => [m]);
  }

  if (lineBreakMode === "accent-isolated" || lineBreakMode === "news-blocks") {
    const accentIdx = metas.findIndex((m) => m.isAccent);
    if (accentIdx >= 0) {
      const before = metas.slice(0, accentIdx);
      const accent = metas[accentIdx]!;
      const after = metas.slice(accentIdx + 1);
      const lines: TokenWithMeta[][] = [];
      if (before.length > 0) lines.push(before);
      lines.push([accent]);
      if (after.length > 0) lines.push(after);
      return lines;
    }
  }

  if (totalWords <= 4) {
    // Single or two-line layout
    if (totalWords <= 2) return [metas];
    // 3-4 words: check if accent word should get its own line
    const accentIdx = metas.findIndex((m) => m.isAccent);
    if (accentIdx >= 0) {
      const before = metas.slice(0, accentIdx);
      const accent = metas[accentIdx]!;
      const after = metas.slice(accentIdx + 1);
      const lines: TokenWithMeta[][] = [];
      if (before.length > 0) lines.push(before);
      lines.push([accent]);
      if (after.length > 0) lines.push(after);
      return lines.slice(0, 3);
    }
    // No accent: split roughly in half
    const mid = Math.ceil(totalWords / 2);
    return [metas.slice(0, mid), metas.slice(mid)].filter((l) => l.length > 0);
  }

  // More than 4 words: split into lines of 2-3, up to 3 lines
  const wordsPerLine = Math.ceil(totalWords / 3);
  const lines: TokenWithMeta[][] = [];
  for (let i = 0; i < totalWords; i += wordsPerLine) {
    lines.push(metas.slice(i, i + wordsPerLine));
    if (lines.length >= 3) break;
  }
  return lines;
}

// â”€â”€ Entrance animation helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getEntranceStyle(entrance: string | undefined, progress: number): React.CSSProperties {
  switch (entrance) {
    case "normal":
      return {
        opacity: progress,
        transform: `scale(${interpolate(progress, [0, 1], [0.95, 1])})`,
      };
    case "rise":
      return {
        opacity: progress,
        transform: `translateY(${interpolate(progress, [0, 1], [0.5, 0])}em)`,
      };
    case "fade":
      return { opacity: progress };
    case "pop":
      return {
        opacity: progress,
        transform: `scale(${interpolate(progress, [0, 1], [0.8, 1])})`,
      };
    case "typewriter":
    case "write":
      return { opacity: progress };
    case "none":
      return { opacity: 1, transform: "none" };
    default:
      return {};
  }
}

// â”€â”€ Single word component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MixedWord({
  text,
  tokens,
  isAccent,
  isPill,
  baseFontCqw,
  entranceProgress,
  rawEntranceProgress,
  isActive,
  isPast,
  styleOverrides,
  wordIndex,
  isLast,
}: {
  text: string;
  tokens: MixedTypeTokens;
  isAccent: boolean;
  isPill: boolean;
  baseFontCqw: number;
  entranceProgress: number;
  rawEntranceProgress?: number;
  isActive: boolean;
  isPast?: boolean;
  styleOverrides?: any;
  wordIndex: number;
  isLast?: boolean;
}) {
  const t = isAccent ? tokens.accent : tokens.base;
  const displayText = applyCase(text, t.case);

  let fontSize = baseFontCqw * (isAccent ? t.sizeEm : tokens.base.sizeEm);

  // Parse outline
  let stroke: string | undefined;
  if (tokens.outline) {
    const parts = tokens.outline.split(" ");
    stroke = parts.length >= 2 ? `${parts[0]} ${parts.slice(1).join(" ")}` : undefined;
  }

  // Pill styling (only for Editorial Rose style, only on base stopwords)
  let pillBg: string | undefined;
  let pillPadding: string | undefined;
  let pillRadius: string | undefined;
  let pillColor: string | undefined;

  const scaleX = isAccent ? tokens.accent.scaleX : undefined;

  let pillBoxShadow: string | undefined;

  if (isPill && tokens.pill) {
    pillPadding = tokens.pill.paddingEm;
    pillRadius = tokens.pill.radius;
    pillBoxShadow = tokens.pill.boxShadow;

    if (tokens.pill.applyTo === "all") {
      // All words get a box. Accent uses colorAccent (if set) else color; base uses color.
      if (isAccent) {
        pillBg = tokens.pill.colorAccent || tokens.pill.color;
        pillColor = tokens.accent.color;
      } else {
        pillBg = tokens.pill.color;
        pillColor = tokens.base.color;
        // colorActive on base words: only if explicitly set AND not disabled
        if (tokens.pill.colorActive && isActive) {
          pillBg = tokens.pill.colorActive;
        }
      }
    } else if (tokens.pill.applyTo === "accent" && isAccent) {
      // Only accent gets the colored pill
      pillBg = tokens.pill.colorAccent || tokens.pill.color;
      pillColor = tokens.accent.color;
    } else if (tokens.pill.applyTo === "base" && !isAccent) {
      pillBg = tokens.pill.color;
      pillColor = tokens.base.color;
    } else if (tokens.pill.applyTo === "accent" && !isAccent && tokens.pill.colorBase) {
      // Base words get cream/off-white pill when applyTo="accent" and colorBase is set
      pillBg = tokens.pill.colorBase;
      pillColor = tokens.base.color;
    } else {
      pillBg = "transparent";
    }
  }

  // --- Apply Overrides ---
  const effEntrance = styleOverrides?.animation ? styleOverrides.animation : tokens.entrance;

  if (!isAccent && styleOverrides?.normalBackground === false) {
    pillBg = undefined;
    pillPadding = undefined;
    pillRadius = undefined;
    tokens.shadow = "none";
  }

  const entranceStyle = getEntranceStyle(effEntrance, entranceProgress);

  let fontFamily = t.fontFamily;
  const effNormalFont = styleOverrides?.normalFont || styleOverrides?.fontFamilyOverride;
  const effCatchyFont = styleOverrides?.catchyFont || styleOverrides?.fontFamilyEmphasisOverride;
  if (!isAccent && effNormalFont) fontFamily = effNormalFont;
  if (isAccent && effCatchyFont) fontFamily = effCatchyFont;

  let fontWeight = t.weight;
  if (!isAccent && styleOverrides?.normalWeight !== undefined)
    fontWeight = styleOverrides.normalWeight;
  if (isAccent && styleOverrides?.catchyWeight !== undefined)
    fontWeight = styleOverrides.catchyWeight;

  let textColor = pillColor || t.color;
  // Apply token colorActive if word is spoken
  if (isActive && t.colorActive) {
    textColor = t.colorActive;
  } else if (isPast && t.colorPast) {
    textColor = t.colorPast;
  }
  const effNormalColor = styleOverrides?.normalColor || styleOverrides?.colorOverride;
  const effCatchyColor = styleOverrides?.catchyColor || styleOverrides?.catchyColorOverride;
  if (!isAccent && effNormalColor) textColor = effNormalColor;
  if (isAccent && effCatchyColor) textColor = effCatchyColor;

  if (isAccent && styleOverrides?.catchySizeMultiplier !== undefined) {
    fontSize = baseFontCqw * styleOverrides.catchySizeMultiplier;
  } else if (!isAccent && styleOverrides?.normalSizeMultiplier !== undefined) {
    fontSize = baseFontCqw * tokens.base.sizeEm * styleOverrides.normalSizeMultiplier;
  }

  // Spoken word — only when explicitly enabled
  if (isActive && styleOverrides?.spokenWord?.enabled === true) {
    const overrideColor = isAccent
        ? styleOverrides?.spokenWord?.colorOnCatchy || styleOverrides?.spokenWord?.color || textColor
        : styleOverrides?.spokenWord?.color || textColor;
    if (overrideColor) textColor = overrideColor;
    if (styleOverrides?.spokenWord?.box) {
      pillBg = overrideColor || "#000000";
      textColor = "#FFFFFF";
      pillPadding = tokens.pill?.paddingEm || "0.1em 0.2em";
      pillRadius = tokens.pill?.radius || "0.2em";
    }
  }

  let transform = entranceStyle.transform || "";
  if (scaleX !== undefined) {
    transform = transform ? `${transform} scaleX(${scaleX})` : `scaleX(${scaleX})`;
  }

  if (tokens.layering === "playful-scatter") {
    const rand = Math.abs(Math.sin(wordIndex * 12.9898 + 78.233)) * 43758.5453;
    const angle = (rand - Math.floor(rand)) * 14 - 7; // -7 to 7 degrees
    const yOffset = (rand - Math.floor(rand)) * 0.4 - 0.2; // -0.2 to 0.2 em
    transform = `${transform} rotate(${angle}deg) translateY(${yOffset}em)`;
  }

  let maskImage = undefined;
  let showCursor = false;
  let cursorLeft = 0;

  if (effEntrance === "typewriter" || effEntrance === "write") {
    maskImage = `linear-gradient(to right, black ${entranceProgress * 100}%, transparent ${entranceProgress * 100}%)`;
    const p = rawEntranceProgress ?? entranceProgress;
    if (effEntrance === "typewriter" && p >= 0 && p < 1) {
      showCursor = true;
      cursorLeft = entranceProgress * 100;
    }
  }

  const isItalic = Boolean(
    t.italic ||
    (fontFamily && fontFamily.toLowerCase().includes("italic"))
  );

  return (
    <span
      style={{
        display: "inline-block",
        fontFamily,
        fontWeight,
        fontStyle: t.italic ? "italic" : "normal",
        fontSize: `${fontSize}cqw`,
        letterSpacing: styleOverrides?.letterSpacing
          ? `${parseFloat(String(t.tracking || 0)) + styleOverrides.letterSpacing * 0.05}em`
          : t.tracking || "normal",
        color: textColor,
        textShadow: tokens.shadow,
        WebkitTextStroke: stroke,
        paintOrder: "stroke fill",
        marginRight: 0,
        lineHeight: (tokens.leading || 1.1) * (styleOverrides?.lineSpacing || 1),
        background: pillBg,
        padding: pillPadding || (isItalic ? "0 0.12em" : undefined),
        borderRadius: pillRadius,
        boxShadow: pillBoxShadow,
        transition: "background 0.1s ease-out, color 0.1s ease-out",
        opacity: entranceStyle.opacity,
        transform,
        position: "relative",
      }}
    >
      <span
        style={{
          display: "inline-block",
          WebkitMaskImage: maskImage,
          maskImage: maskImage,
          padding: maskImage ? "0.4em" : (isItalic ? "0.04em 0.1em" : 0),
          margin: maskImage ? "-0.4em" : (isItalic ? "-0.04em -0.1em" : 0),
        }}
      >
        {displayText}
      </span>
      {showCursor && (
        <span
          style={{
            position: "absolute",
            left: `${cursorLeft}%`,
            top: "10%",
            bottom: "10%",
            width: "0.08em",
            backgroundColor: textColor,
            animation: "capBlink 0.7s infinite step-end",
          }}
        />
      )}
    </span>
  );
}

// â”€â”€ Main renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type MixedTypeRendererProps = {
  page: CaptionPage;
  tokens: MixedTypeTokens;
  emphasis: EmphasisMap;
  baseFontCqw: number;
  autoAccent: boolean;
  entranceProgress: number;
  activeWordIndex: number;
  styleOverrides?: any;
  frame?: number;
  fps?: number;
  posterState?: {
    activeIndex?: number;
  } | undefined;
  isEditing?: boolean;
};

export const MixedTypeRenderer: React.FC<MixedTypeRendererProps> = ({
  page,
  tokens,
  emphasis,
  baseFontCqw,
  autoAccent,
  entranceProgress,
  activeWordIndex,
  styleOverrides,
  frame = 0,
  fps = 30,
  posterState,
  isEditing = false,
}) => {
  const lines = splitIntoLines(page.tokens, emphasis, autoAccent, tokens.lineBreakMode);

  const effAlign = styleOverrides?.align || (tokens.layout === "stack-left" ? "left" : "center");
  const textAlign = effAlign;
  const justifyContent =
    effAlign === "left" ? "flex-start" : effAlign === "right" ? "flex-end" : "center";

  const scope = styleOverrides?.animationScope || "caption";
  const effAnim = styleOverrides?.animation || tokens.entrance;

  let containerOpacity = 1;
  let containerTransform = "none";
  let containerMaskImage = undefined;

  if (scope === "caption" && !posterState && !isEditing) {
    if (effAnim === "typewriter" || effAnim === "write") {
      const appearFrame = (page.startMs / 1000) * fps;
      const endFrame = (page.endMs / 1000) * fps;
      const duration = Math.max(1, endFrame - appearFrame);
      const p = Math.max(0, Math.min(1, (frame - appearFrame) / duration));
      containerMaskImage = `linear-gradient(to right, black ${p * 100}%, transparent ${p * 100}%)`;
    } else {
      if (effAnim === "fade" || effAnim === "rise" || effAnim === "normal") {
        containerOpacity = entranceProgress;
      }
      if (effAnim === "rise") {
        containerTransform = `translateY(${interpolate(entranceProgress, [0, 1], [0.6, 0])}em)`;
      } else if (effAnim === "pop") {
        containerTransform = `scale(${interpolate(entranceProgress, [0, 1], [0.8, 1.02])})`;
      } else if (effAnim === "normal") {
        containerTransform = `scale(${interpolate(entranceProgress, [0, 1], [0.95, 1])})`;
      }
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: justifyContent,
        width: "100%",
        maxWidth: "100%",
        overflow: "visible",
        writingMode: tokens.writingMode,
        opacity: containerOpacity,
        transform: containerTransform !== "none" ? containerTransform : undefined,
        WebkitMaskImage: containerMaskImage,
        maskImage: containerMaskImage,
      }}
    >
      {lines.map((line, lineIdx) => {
        const hasAccent = line.some((w) => w.isAccent);
        const isHeroOverlap = tokens.layering === "hero-overlap" && hasAccent;

        let lineBg = undefined;
        let linePadding = undefined;
        let lineRadius = undefined;

        if (tokens.lineBox) {
          linePadding = tokens.lineBox.paddingEm;
          lineRadius = tokens.lineBox.radius;
          lineBg =
            hasAccent && tokens.lineBox.colorAccent
              ? tokens.lineBox.colorAccent
              : tokens.lineBox.colorBase;
        }

        return (
          <div
            key={lineIdx}
            style={{
              textAlign,
              lineHeight: (tokens.leading || 1.1) * (styleOverrides?.lineSpacing || 1),
              marginTop:
                lineIdx > 0 && !isHeroOverlap
                  ? `${(tokens.accentOverlapEm || 0) * (styleOverrides?.lineSpacing || 1) + ((styleOverrides?.lineSpacing || 1) - 1) * 0.25}em`
                  : 0,
              maxWidth: "100%",
              width: isHeroOverlap ? "100%" : undefined,
              display: "flex",
              flexWrap: "wrap",
              justifyContent,
              alignItems: "baseline",
              rowGap: `${0.15 * (styleOverrides?.lineSpacing ?? 1)}em`,
              columnGap: `${0.15 + (styleOverrides?.wordSpacing || 0) * 0.1}em`,
              background: lineBg,
              padding: linePadding,
              borderRadius: lineRadius,
              position: isHeroOverlap ? "absolute" : "relative",
              zIndex: isHeroOverlap ? 10 : 1,
              left: isHeroOverlap ? 0 : undefined,
              top: isHeroOverlap ? "50%" : undefined,
              transform: isHeroOverlap ? "translateY(-50%)" : undefined,
            }}
          >
            {line.map((word, localIdx) => {
              // Pills
              let shouldPill = false;
              if (tokens.pill) {
                if (tokens.pill.applyTo === "all") shouldPill = true;
                else if (tokens.pill.applyTo === "base" && !word.isAccent && isPillWord(word.text))
                  shouldPill = true;
                else if (tokens.pill.applyTo === "accent" && word.isAccent) shouldPill = true;
              }
              const isActive = word.index === activeWordIndex;
              const isPast = word.index < activeWordIndex;

              // Per-word entrance for typewriter/write
              const effAnim = styleOverrides?.animation || tokens.entrance;
              let wordEntranceProgress = entranceProgress;
              let rawEntranceProgress = entranceProgress;

              if (posterState || isEditing) {
                wordEntranceProgress = 1;
                rawEntranceProgress = 1;
              } else if (scope === "caption") {
                // Caption scope: parent container handles the animation.
                // Individual words render fully visible.
                wordEntranceProgress = 1;
                rawEntranceProgress = 1;
              } else {
                // Word scope: each word animates independently from its own fromMs.
                if ((effAnim === "typewriter" || effAnim === "write") && frame !== undefined) {
                  const appearFrame = (word.fromMs / 1000) * fps;
                  const endFrame = (word.toMs / 1000) * fps;
                  const wordDuration = Math.max(1, endFrame - appearFrame);
                  const p = Math.max(0, Math.min(1, (frame - appearFrame) / wordDuration));

                  rawEntranceProgress = p;
                  if (effAnim === "typewriter") {
                    const steps = word.text.length;
                    wordEntranceProgress = Math.floor(p * steps) / steps;
                  } else {
                    wordEntranceProgress = p;
                  }
                } else if (effAnim !== "none" && frame !== undefined) {
                  // Pop, Rise, Fade, Normal: per-word spring from word.fromMs
                  wordEntranceProgress = spring({
                    frame: frame - (word.fromMs / 1000) * fps,
                    fps,
                    config: { damping: 14, stiffness: 200 },
                      durationInFrames: 12,
                  });
                  rawEntranceProgress = wordEntranceProgress;
                }
              }

              return (
                <MixedWord
                  key={word.index}
                  text={word.text}
                  tokens={tokens}
                  isAccent={word.isAccent}
                  isPill={!!shouldPill}
                  baseFontCqw={baseFontCqw}
                  entranceProgress={wordEntranceProgress}
                  rawEntranceProgress={rawEntranceProgress}
                  isActive={isActive}
                    isPast={isPast}
                    styleOverrides={styleOverrides}
                  wordIndex={word.index}
                  isLast={localIdx === line.length - 1}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
};


















