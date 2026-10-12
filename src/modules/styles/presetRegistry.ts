import type { CaptionStyle } from "./types";
import { LEGACY_CAPTION_STYLES, LEGACY_FONT_FAMILIES_TO_PRELOAD } from "./legacyPresets";
import { VEED_CAPTION_STYLES, VEED_FONT_FAMILIES_TO_PRELOAD } from "./veedPresets";

// â”€â”€ Feature Flags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const SHOW_LEGACY_STYLES = false;

// â”€â”€ Font preloading list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const FONT_FAMILIES_TO_PRELOAD = [
  ...LEGACY_FONT_FAMILIES_TO_PRELOAD,
  ...VEED_FONT_FAMILIES_TO_PRELOAD,
];

/** Preload all font families used by styles. Call once before first render. */
export async function preloadFonts(): Promise<void> {
  const promises = FONT_FAMILIES_TO_PRELOAD.map((f) =>
    document.fonts.load(`${f.style === "italic" ? "italic " : ""}${f.weight} 16px ${f.family}`),
  );
  await Promise.all(promises);
}

// â”€â”€ Style Registry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const CAPTION_STYLES: CaptionStyle[] = [
  ...VEED_CAPTION_STYLES,
  ...(SHOW_LEGACY_STYLES ? LEGACY_CAPTION_STYLES : []),
];

export const getStyle = (id: string): CaptionStyle => {
  // Always search VEED first, then legacy, even if legacy is hidden from UI.
  // This ensures old projects using legacy IDs still render correctly.
  return (
    VEED_CAPTION_STYLES.find((style) => style.id === id) ??
    LEGACY_CAPTION_STYLES.find((style) => style.id === id) ??
    VEED_CAPTION_STYLES[0]!
  );
};

// â”€â”€ Bounding Box Calculation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Calculates sufficient padding to prevent mask-image or container clipping
 * from font ascenders, descenders, stroke, shadow, italic overhang, and scaling.
 */
export function getSafeBoundingBoxPadding(tokens: any, styleOverrides?: any): string {
  if (!tokens) return "0.25em 0.5em";

  let maxFontSize = 1;
  if (tokens.sizeEm) maxFontSize = tokens.sizeEm;
  if (tokens.accent?.sizeEm) maxFontSize = Math.max(maxFontSize, tokens.accent.sizeEm);
  
  if (styleOverrides?.catchySizeMultiplier) {
     maxFontSize = Math.max(maxFontSize, (tokens.accent?.sizeEm || 1) * styleOverrides.catchySizeMultiplier);
  }

  // Base padding proportional to font size to cover ascenders, descenders, and swashes
  let padEm = Math.max(0.35, maxFontSize * 0.35);
  let padHoriz = 0.1; // Small base internal padding

  const isItalic = Boolean(
    tokens.italic ||
    tokens.base?.italic ||
    tokens.accent?.italic ||
    (typeof tokens.fontFamily === "string" && tokens.fontFamily.toLowerCase().includes("italic")) ||
    (typeof tokens.accent?.fontFamily === "string" && tokens.accent?.fontFamily.toLowerCase().includes("italic")) ||
    (typeof styleOverrides?.normalFont === "string" && styleOverrides.normalFont.toLowerCase().includes("italic")) ||
    (typeof styleOverrides?.catchyFont === "string" && styleOverrides.catchyFont.toLowerCase().includes("italic"))
  );
  if (isItalic) {
    padEm += 0.25;
    padHoriz += 0.15; // Italic leans to the right
  }

  if (tokens.strokeEm) {
    padEm += Number(tokens.strokeEm) || 0;
    padHoriz += Number(tokens.strokeEm) || 0;
  }
  if (tokens.outline) {
    padEm += 0.12;
    padHoriz += 0.12;
  }

  const shadow = tokens.shadow || tokens.base?.shadow;
  if (shadow && shadow !== "none") {
    const matches = shadow.match(/\d+(?:\.\d+)?(?:px|em)/g);
    if (matches) {
      let maxVal = 0.15;
      for (const m of matches) {
        if (m.endsWith("em")) maxVal = Math.max(maxVal, parseFloat(m));
        if (m.endsWith("px")) maxVal = Math.max(maxVal, parseFloat(m) / 100);
      }
      padEm += maxVal;
      padHoriz += maxVal;
    } else {
      padEm += 0.2;
      padHoriz += 0.2;
    }
  }

  let maxScale = 1;
  const entrance = tokens.entrance || styleOverrides?.animation;
  if (entrance === "pop") maxScale *= 1.1;
  if (styleOverrides?.catchySizeMultiplier)
    maxScale = Math.max(maxScale, styleOverrides.catchySizeMultiplier);
  if (styleOverrides?.normalSizeMultiplier)
    maxScale = Math.max(maxScale, styleOverrides.normalSizeMultiplier);

  const totalPad = padEm * maxScale;
  const padVertical = Math.max(0.25, Number((totalPad * 0.45).toFixed(2)));
  const padHorizontal = Math.max(0.1, Number((padHoriz * maxScale).toFixed(2)));

  return `${padVertical}em ${padHorizontal}em`;
}

