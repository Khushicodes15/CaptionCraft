import React from "react";
import { spring, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { CaptionStyle, StyleTokens, EmphasisMap } from "../../modules/styles/types";
import { getStackedLines, getEffectiveEmphasis } from "../../lib/layout";
import { MixedTypeRenderer } from "./MixedTypeEngine";
import type { CaptionPage } from "./CaptionedVideo";

export type EngineRendererProps = {
  page: CaptionPage;
  style: CaptionStyle;
  emphasis: EmphasisMap;
  baseFontCqw: number;
  autoAccent?: boolean;
  posterState?: {
    activeIndex: number;
  };
  styleOverrides?: {
    align?: "left" | "center" | "right";
    letterSpacing?: number;
    wordSpacing?: number;
    lineSpacing?: number;
    normalFont?: string;
    normalWeight?: number;
    normalColor?: string;
    normalSizeMultiplier?: number;
    catchyFont?: string;
    catchyWeight?: number;
    catchyColor?: string;
    catchySizeMultiplier?: number;
    spokenWord?: {
      enabled: boolean;
      color?: string;
      colorOnCatchy?: string;
      box?: boolean;
    };
    animation?: "none" | "rise" | "fade" | "pop" | "typewriter" | "write";
    animationScope?: "caption" | "word";
    linesPerCaption?: number;
  };
};

function Word({
  token,
  tokens,
  engine,
  baseFontCqw,
  active,
  level,
  entranceProgress,
  activeProgress,
  styleOverrides,
  animationScope = "caption",
  pageStartMs = 0,
  pageEndMs = 1000,
  frame,
  fps,
  posterState,
  isLast,
}: {
  token: CaptionPage["tokens"][number];
  tokens: StyleTokens;
  engine: CaptionStyle["engine"];
  baseFontCqw: number;
  active: boolean;
  level: number;
  entranceProgress: number;
  activeProgress: number;
  styleOverrides?: any;
  animationScope?: "caption" | "word";
  pageStartMs?: number;
  pageEndMs?: number;
  frame?: number;
  fps?: number;
  posterState?: any;
  isLast?: boolean;
}) {
  const isEmphasis = level > 0;

  let color = isEmphasis ? tokens.colorEmphasis : tokens.colorBase;
  let scale = 1;
  let bg = undefined;
  let fontSize = baseFontCqw;
  if (isEmphasis && styleOverrides?.catchySizeMultiplier !== undefined) {
    fontSize = baseFontCqw * styleOverrides.catchySizeMultiplier;
  } else if (!isEmphasis && styleOverrides?.normalSizeMultiplier !== undefined) {
    fontSize = baseFontCqw * styleOverrides.normalSizeMultiplier;
  }
  let padding = undefined;
  let borderRadius = undefined;
  let shadow = tokens.shadow;
  let stroke = undefined;

  switch (engine) {
    case "karaoke-fill":
      if (active) color = tokens.colorActive;
      break;

    case "box-highlight":
      // Always apply layout properties to avoid shifting when active
      padding = tokens.box?.paddingEm;
      borderRadius = tokens.box?.radius;
      if (posterState || tokens.colorBase === tokens.colorActive) {
        bg = tokens.box?.color;
        color = active ? tokens.colorActive : (isEmphasis ? tokens.colorEmphasis : tokens.colorBase);
      } else {
        bg = active ? tokens.box?.color : "transparent";
        if (active) color = tokens.colorActive;
      }
      break;

    case "outline-pop":
      if (active) color = tokens.colorActive;
      stroke = tokens.strokeEm ? `${tokens.strokeEm}em ${color}` : undefined;
      scale = 1 + 0.1 * activeProgress;
      break;

    case "kinetic-slam":
      color = active ? tokens.colorActive : isEmphasis ? tokens.colorEmphasis : tokens.colorBase;
      scale = active ? interpolate(activeProgress, [0, 1], [1.5, 1.1]) : 1;
      break;

    case "editorial-stack":
      fontSize = isEmphasis ? baseFontCqw * 2.2 : baseFontCqw * 0.8;
      if (active) color = tokens.colorActive;
      break;

    case "glow-shadow":
      if (active) color = tokens.colorActive;
      break;
  }

  if (!stroke && tokens.strokeEm) {
    const strokeColor = color.toLowerCase() === "#ffffff" ? "#000000" : (color.toLowerCase() === "#000000" ? "#ffffff" : "#000000");
    stroke = `${tokens.strokeEm}em ${strokeColor}`;
  }

  if (!isEmphasis && styleOverrides?.normalBackground === false) {
    bg = undefined;
    shadow = undefined;
  }

  const effEntrance = styleOverrides?.animation ? styleOverrides.animation : tokens.entrance;

  const opacity =
    effEntrance === "fade" || effEntrance === "rise" || effEntrance === "normal"
      ? entranceProgress
      : 1;
  const translateY =
    effEntrance === "rise" ? interpolate(entranceProgress, [0, 1], [0.6, 0]) + "em" : "0";
  const popScale = effEntrance === "pop" ? interpolate(entranceProgress, [0, 1], [0.8, 1.02]) : 1;
  const normalScale =
    effEntrance === "normal" ? interpolate(entranceProgress, [0, 1], [0.95, 1]) : 1;

  // Typewriter and Write effects are calculated per-word based on audio timing
  let maskImage = undefined;
  let showCursor = false;
  let cursorLeft = 0;

  if (effEntrance === "typewriter" || effEntrance === "write") {
    // Using frame and fps which are now passed in
    const isWordScope = animationScope === "word";
    const appearFrame = ((isWordScope ? token.fromMs : pageStartMs) / 1000) * (fps || 30);
    const endFrame = ((isWordScope ? token.toMs : pageEndMs) / 1000) * (fps || 30);
    const wordDuration = Math.max(1, endFrame - appearFrame);

    // For live preview (posterState is active), just show fully revealed
    const p = posterState
      ? 1
      : Math.max(0, Math.min(1, ((frame || 0) - appearFrame) / wordDuration));

    let progress = p;
    if (effEntrance === "typewriter") {
      // Step through exact character count
      const steps = token.text.length;
      progress = Math.floor(p * steps) / steps;
    }

    maskImage = `linear-gradient(to right, black ${progress * 100}%, transparent ${progress * 100}%)`;

    if (effEntrance === "typewriter" && p >= 0 && p < 1) {
      showCursor = true;
      cursorLeft = progress * 100;
    }
  }

  let fontFamily =
    isEmphasis && tokens.fontFamilyEmphasis ? tokens.fontFamilyEmphasis : tokens.fontFamily;
  const effNormalFont = styleOverrides?.normalFont || styleOverrides?.fontFamilyOverride;
  const effCatchyFont = styleOverrides?.catchyFont || styleOverrides?.fontFamilyEmphasisOverride;
  if (!isEmphasis && effNormalFont) fontFamily = effNormalFont;
  if (isEmphasis && effCatchyFont) fontFamily = effCatchyFont;

  let fontWeight = tokens.weight;
  if (!isEmphasis && styleOverrides?.normalWeight !== undefined)
    fontWeight = styleOverrides.normalWeight;
  if (isEmphasis && styleOverrides?.catchyWeight !== undefined)
    fontWeight = styleOverrides.catchyWeight;

  const effNormalColor = styleOverrides?.normalColor || styleOverrides?.colorOverride;
  const effCatchyColor = styleOverrides?.catchyColor || styleOverrides?.catchyColorOverride;
  if (!isEmphasis && effNormalColor) color = effNormalColor;
  if (isEmphasis && effCatchyColor) color = effCatchyColor;

  // Spoken word highlighting — only when enabled is explicitly true (not just not-false)
  if (active && styleOverrides?.spokenWord?.enabled === true) {
    const overrideColor = isEmphasis
      ? styleOverrides?.spokenWord?.colorOnCatchy || styleOverrides?.spokenWord?.color
      : styleOverrides?.spokenWord?.color;
    if (overrideColor) color = overrideColor;
    if (styleOverrides?.spokenWord?.box) {
      bg = overrideColor || tokens.box?.color || "#000000";
      color = "#FFFFFF";
      padding = tokens.box?.paddingEm || "0.1em 0.2em";
      borderRadius = tokens.box?.radius || "0.2em";
    }
  }

  const isItalic = Boolean(
    tokens.italic ||
    (fontFamily && fontFamily.toLowerCase().includes("italic"))
  );

  return (
    <span
      style={{
        display: "inline-block",
        marginRight: isLast ? 0 : `${0.25 + (styleOverrides?.wordSpacing || 0) * 0.1}em`,
        marginBottom: "0.1em",
        fontFamily,
        fontWeight,
        fontStyle: tokens.italic ? "italic" : "normal",
        textTransform: tokens.uppercase ? "uppercase" : "none",
        color,
        fontSize: `${fontSize}cqw`,
        letterSpacing: styleOverrides?.letterSpacing
          ? `${styleOverrides.letterSpacing * 0.05}em`
          : undefined,
        lineHeight: styleOverrides?.lineSpacing ? (1.15 * styleOverrides.lineSpacing) : 1.15,
        opacity: opacity,
        transform: `translateY(${translateY}) scale(${popScale * normalScale * scale})`,
        textShadow: shadow,
        WebkitTextStroke: stroke,
        paintOrder: "stroke fill",
        background: bg,
        padding: padding
          ? `${parseFloat(padding.split(" ")[0] || "0") * fontSize}cqw ${parseFloat(padding.split(" ")[1] || "0") * fontSize}cqw`
          : (isItalic ? "0 0.12em" : undefined),
        borderRadius: borderRadius ? `${parseFloat(borderRadius) * fontSize}cqw` : undefined,
        transition: "color 0.1s ease-out, background 0.1s ease-out",
        textWrap: "balance",
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
        {token.text}
      </span>
      {showCursor && (
        <span
          style={{
            position: "absolute",
            left: `${cursorLeft}%`,
            top: "10%",
            bottom: "10%",
            width: "0.08em",
            backgroundColor: color,
            animation: "capBlink 0.7s infinite step-end",
          }}
        />
      )}
    </span>
  );
}

export type BaseEngineRendererProps = EngineRendererProps & {
  frame?: number;
  fps?: number;
  isEditing?: boolean;
};

export const BaseEngineRenderer: React.FC<BaseEngineRendererProps> = ({
  page,
  style,
  emphasis,
  baseFontCqw,
  autoAccent = true,
  posterState,
  frame = 0,
  fps = 30,
  styleOverrides,
  isEditing = false,
}) => {
  // â”€â”€ Mixed-type engine: delegate entirely â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (style.engine === "mixed-type" && style.mixedTokens) {
    const mixedScope = styleOverrides?.animationScope || "caption";
    const entranceProgress = posterState || isEditing
      ? 1
      : mixedScope === "caption"
        ? spring({
            frame: frame - (page.startMs / 1000) * fps,
            fps,
            config: { damping: 14, stiffness: 200 },
                      durationInFrames: 12,
          })
        : 1; // word scope: container gets no entrance animation

    let activeWordIndex = posterState?.activeIndex ?? -1;
    if (!posterState) {
      const currentMs = (frame / fps) * 1000;
      const activeToken = page.tokens.find((t) => currentMs >= t.fromMs && currentMs <= t.toMs);
      if (activeToken) activeWordIndex = activeToken.index;
    }

    return (
      <MixedTypeRenderer
        page={page}
        tokens={style.mixedTokens}
        emphasis={emphasis}
        baseFontCqw={baseFontCqw}
        autoAccent={autoAccent}
        entranceProgress={entranceProgress}
        activeWordIndex={activeWordIndex}
        styleOverrides={styleOverrides}
        frame={frame}
        fps={fps}
        posterState={posterState}
        isEditing={isEditing}
      />
    );
  }

  // â”€â”€ Legacy engines â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const isStacked = style.engine === "editorial-stack";
  let lines: CaptionPage["tokens"][];
  if (isStacked) {
    lines = getStackedLines(page.tokens, emphasis);
  } else if (styleOverrides?.linesPerCaption && styleOverrides.linesPerCaption > 1) {
    const total = page.tokens.length;
    const count = styleOverrides.linesPerCaption;
    const perLine = Math.ceil(total / count);
    lines = [];
    for (let i = 0; i < total; i += perLine) {
      lines.push(page.tokens.slice(i, i + perLine));
    }
  } else {
    lines = [page.tokens];
  }

  const scope = styleOverrides?.animationScope || "caption";
  const effAnim = styleOverrides?.animation || style.tokens.entrance;

  let containerEntranceProgress = 1;
  if (!posterState && !isEditing && scope === "caption") {
    if (effAnim === "typewriter" || effAnim === "write") {
      containerEntranceProgress = frame >= (page.startMs / 1000) * fps ? 1 : 0;
    } else {
      containerEntranceProgress = spring({
        frame: frame - (page.startMs / 1000) * fps,
        fps,
        config: { damping: 14, stiffness: 200 },
        durationInFrames: 12,
      });
    }
  }

  const containerOpacity = scope === "caption" && (effAnim === "fade" || effAnim === "rise" || false)
    ? (isEditing ? 1 : containerEntranceProgress)
    : 1;
  const containerTranslateY = scope === "caption" && effAnim === "rise"
    ? interpolate(isEditing ? 1 : containerEntranceProgress, [0, 1], [0.6, 0]) + "em"
    : "0";
  const containerPopScale = scope === "caption" && effAnim === "pop"
    ? interpolate(isEditing ? 1 : containerEntranceProgress, [0, 1], [0.8, 1.02])
    : 1;
  const containerNormalScale = 1;

  let containerMaskImage = undefined;
  if (scope === "caption" && (effAnim === "typewriter" || effAnim === "write") && !posterState && !isEditing) {
    const appearFrame = (page.startMs / 1000) * fps;
    const endFrame = (page.endMs / 1000) * fps;
    const duration = Math.max(1, endFrame - appearFrame);
    const p = Math.max(0, Math.min(1, (frame - appearFrame) / duration));
    containerMaskImage = `linear-gradient(to right, black ${p * 100}%, transparent ${p * 100}%)`;
  }

  return (
    <div style={{
      width: "100%",
      textAlign: (styleOverrides?.align || "center") as any,
      opacity: containerOpacity,
      transform: `translateY(${containerTranslateY}) scale(${containerPopScale * containerNormalScale})`,
      WebkitMaskImage: containerMaskImage,
      maskImage: containerMaskImage,
    }}>
      {lines.map((line, lineIdx) => (
        <div
          key={lineIdx}
          style={{
            lineHeight: styleOverrides?.lineSpacing ? (1.15 * styleOverrides.lineSpacing) : 1.15,
            marginTop: lineIdx > 0 ? `${0.15 * (styleOverrides?.lineSpacing ?? 1)}em` : 0,
          }}
        >
          {line.map((token, localIdx) => {
            let active = false;
            let entranceProgress = 1;
            let activeProgress = 0;

            if (posterState || isEditing) {
              active = token.index === posterState?.activeIndex;
              entranceProgress = 1;
              activeProgress = active ? 1 : 0;
            } else {
              const appearFrame = (token.fromMs / 1000) * fps;
              const effAnim = styleOverrides?.animation || style.tokens.entrance;

              const scope = styleOverrides?.animationScope || "caption";
              
              if (scope === "caption") {
                // Caption scope: container handles entrance. Words render fully visible.
                entranceProgress = 1;
              } else {
                // Word scope: each word animates independently from its own fromMs.
                if (effAnim === "typewriter" || effAnim === "write") {
                  entranceProgress = frame >= (token.fromMs / 1000) * fps ? 1 : 0;
                } else {
                  entranceProgress = spring({
                    frame: frame - (token.fromMs / 1000) * fps,
                    fps,
                    config: { damping: 14, stiffness: 200 },
                      durationInFrames: 12,
                  });
                }
              }

              const activeDurationFrames = (140 / 1000) * fps;
              activeProgress = spring({
                frame: frame - appearFrame,
                fps,
                config: { damping: 12, stiffness: 200 },
                durationInFrames: activeDurationFrames,
              });

              active = (frame / fps) * 1000 >= token.fromMs && (frame / fps) * 1000 <= token.toMs;
            }

            const level = isStacked
              ? getEffectiveEmphasis(token.index, page.tokens, emphasis)
              : (emphasis[String(token.index)] ?? 0);

            return (
              <Word
                key={token.index}
                token={token}
                tokens={style.tokens}
                engine={style.engine}
                baseFontCqw={baseFontCqw}
                active={active}
                level={level}
                entranceProgress={entranceProgress}
                activeProgress={activeProgress}
                styleOverrides={styleOverrides}
                frame={frame}
                fps={fps}
                posterState={posterState}
                isLast={localIdx === line.length - 1}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};

export const EngineRenderer: React.FC<EngineRendererProps> = (props) => {
  if (props.posterState) {
    return <BaseEngineRenderer {...props} />;
  }
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return <BaseEngineRenderer {...props} frame={frame} fps={fps} />;
};









