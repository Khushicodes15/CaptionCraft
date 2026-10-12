// ── Font imports (weight + italic files) ────────────────────────────────
// Scripts
import "@fontsource/pinyon-script/400.css";
import "@fontsource/ballet/400.css";
import "@fontsource/imperial-script/400.css";
import "@fontsource/great-vibes/400.css";
import "@fontsource/yellowtail/400.css";
import "@fontsource/sacramento/400.css";
import "@fontsource/meow-script/400.css";
import "@fontsource/homemade-apple/400.css";

// Serifs
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/400-italic.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/playfair-display/700-italic.css";
import "@fontsource/playfair-display/800.css";
import "@fontsource/playfair-display/800-italic.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/bodoni-moda/400.css";
import "@fontsource/bodoni-moda/400-italic.css";
import "@fontsource/bodoni-moda/700.css";
import "@fontsource/bodoni-moda/700-italic.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/600-italic.css";
import "@fontsource/cormorant-garamond/700.css";
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/800.css";
import "@fontsource/dm-serif-display/400.css";
import "@fontsource/dm-serif-display/400-italic.css";

// Display / Chunky
import "@fontsource/caprasimo/400.css";
import "@fontsource/bagel-fat-one/400.css";
import "@fontsource/shrikhand/400.css";
import "@fontsource/bungee/400.css";
import "@fontsource/bangers/400.css";
import "@fontsource/pirata-one/400.css";

// Sans
import "@fontsource/inter-tight/300.css";
import "@fontsource/inter-tight/400.css";
import "@fontsource/inter-tight/700.css";
import "@fontsource/inter-tight/800.css";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/instrument-sans/700.css";
import "@fontsource/anton/400.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/inter/900.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/800.css";
import "@fontsource/poppins/900.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/montserrat/800.css";
import "@fontsource/montserrat/900.css";

// Handwritten
import "@fontsource/amatic-sc/400.css";
import "@fontsource/amatic-sc/700.css";
import "@fontsource/caveat/400.css";
import "@fontsource/caveat/700.css";

// Monospace
import "@fontsource/courier-prime/400.css";
import "@fontsource/courier-prime/700.css";

import type { CaptionStyle, StyleTokens, MixedTypeTokens } from "./types";

// ── Font family constants ───────────────────────────────────────────────
// Scripts
const PINYON = "'Pinyon Script', cursive";
const BALLET = "'Ballet', cursive";
const IMPERIAL = "'Imperial Script', cursive";
const GREAT_VIBES = "'Great Vibes', cursive";
const YELLOWTAIL = "'Yellowtail', cursive";
const SACRAMENTO = "'Sacramento', cursive";
const MEOW = "'Meow Script', cursive";
const HOMEMADE = "'Homemade Apple', cursive";

// Serifs
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const INSTRUMENT_SERIF = "'Instrument Serif', serif";
const BODONI = "'Bodoni Moda', serif";
const CORMORANT = "'Cormorant Garamond', serif";
const CINZEL = "'Cinzel', serif";
const DM_SERIF = "'DM Serif Display', serif";

// Display
const CAPRASIMO = "'Caprasimo', cursive";
const BAGEL = "'Bagel Fat One', cursive";
const SHRIKHAND = "'Shrikhand', cursive";
const BUNGEE = "'Bungee', cursive";
const BANGERS = "'Bangers', cursive";
const PIRATA = "'Pirata One', cursive";

// Sans
const INTER_TIGHT = "'Inter Tight', system-ui, sans-serif";
const INSTRUMENT_SANS = "'Instrument Sans', sans-serif";
const ANTON = "'Anton', sans-serif";
const BEBAS = "'Bebas Neue', sans-serif";
const INTER = "'Inter', system-ui, sans-serif";
const POPPINS = "'Poppins', sans-serif";
const MONTSERRAT = "'Montserrat', sans-serif";

// Handwritten
const AMATIC = "'Amatic SC', cursive";
const CAVEAT = "'Caveat', cursive";

// Monospace
const COURIER = "'Courier Prime', monospace";

// ── Default shadow for legibility ───────────────────────────────────────
const SOFT_SHADOW = "0 2px 12px rgba(0,0,0,0.35)";

// ── Default legacy tokens (for classic styles only) ─────────────────────
const defaultTokens: StyleTokens = {
  fontFamily: INTER,
  weight: 700,
  colorBase: "#FFFFFF",
  colorActive: "#FFFFFF",
  colorEmphasis: "#FFFFFF",
  entrance: "fade",
};

// ── Helper to build a mixed-type style ──────────────────────────────────
function mixedStyle(
  id: string,
  name: string,
  category: CaptionStyle["category"],
  mixed: MixedTypeTokens,
): CaptionStyle {
  return {
    id,
    name,
    category,
    engine: "mixed-type",
    tokens: {
      fontFamily: mixed.base.fontFamily,
      ...(mixed.accent.fontFamily && { fontFamilyEmphasis: mixed.accent.fontFamily }),
      weight: mixed.base.weight,
      ...(mixed.base.italic ? { italic: true } : {}),
      ...(mixed.base.case === "upper" ? { uppercase: true } : {}),
      colorBase: mixed.base.color,
      colorActive: mixed.base.color,
      colorEmphasis: mixed.accent.color,
      ...(mixed.shadow ? { shadow: mixed.shadow } : {}),
      entrance: mixed.entrance === "write" ? "fade" : mixed.entrance,
    },
    mixedTokens: mixed,
    capabilities: {
      supportsFontOverride: false, // Aesthetic/Dynamic generally don't allow font overrides to preserve design
      supportsWeightOverride: false,
      supportsColorOverride: true,
      supportsEmphasis: true,
      supportsActiveWord: true,
      supportsBackground: false,
      supportsOutline: false,
      supportsShadow: true,
      supportsAnimation: true,
    },
  };
}

/** Helper for simple legacy styles */
function simpleStyle(
  id: string,
  name: string,
  category: CaptionStyle["category"],
  engine: CaptionStyle["engine"],
  tokens: StyleTokens,
): CaptionStyle {
  return {
    id,
    name,
    category,
    engine,
    tokens,
    capabilities: {
      supportsFontOverride:
        category === "social" || category === "business" || category === "retro",
      supportsWeightOverride: true,
      supportsColorOverride: true,
      supportsEmphasis: engine === "karaoke-fill" || engine === "box-highlight", // Some simplistic guess for legacy
      supportsActiveWord: true,
      supportsBackground: engine === "box-highlight",
      supportsOutline: engine === "outline-pop" || !!tokens.strokeEm,
      supportsShadow: true,
      supportsAnimation: true,
    },
  };
}

// ── Font preloading list ────────────────────────────────────────────────
export const LEGACY_FONT_FAMILIES_TO_PRELOAD = [
  { family: "Pinyon Script", weight: 400 },
  { family: "Ballet", weight: 400 },
  { family: "Imperial Script", weight: 400 },
  { family: "Great Vibes", weight: 400 },
  { family: "Yellowtail", weight: 400 },
  { family: "Sacramento", weight: 400 },
  { family: "Meow Script", weight: 400 },
  { family: "Homemade Apple", weight: 400 },
  { family: "Playfair Display", weight: 700 },
  { family: "Playfair Display", weight: 800, style: "italic" },
  { family: "Instrument Serif", weight: 400 },
  { family: "Instrument Serif", weight: 400, style: "italic" },
  { family: "Bodoni Moda", weight: 700 },
  { family: "Bodoni Moda", weight: 400, style: "italic" },
  { family: "Cormorant Garamond", weight: 600 },
  { family: "Cinzel", weight: 600 },
  { family: "DM Serif Display", weight: 400 },
  { family: "Caprasimo", weight: 400 },
  { family: "Bagel Fat One", weight: 400 },
  { family: "Shrikhand", weight: 400 },
  { family: "Bungee", weight: 400 },
  { family: "Bangers", weight: 400 },
  { family: "Pirata One", weight: 400 },
  { family: "Inter Tight", weight: 800 },
  { family: "Instrument Sans", weight: 700 },
  { family: "Anton", weight: 400 },
  { family: "Bebas Neue", weight: 400 },
  { family: "Inter", weight: 800 },
  { family: "Poppins", weight: 700 },
  { family: "Montserrat", weight: 800 },
  { family: "Amatic SC", weight: 700 },
  { family: "Caveat", weight: 700 },
  { family: "Courier Prime", weight: 400 },
];

// ═══════════════════════════════════════════════════════════════════════
//  AESTHETIC STYLES (mixed-type engine) — 15 styles
// ═══════════════════════════════════════════════════════════════════════

export const LEGACY_CAPTION_STYLES: CaptionStyle[] = [
  // 1. Soft Vlog
  mixedStyle("soft-vlog", "Soft Vlog", "aesthetic", {
    base: { fontFamily: INTER_TIGHT, weight: 800, case: "lower", sizeEm: 1, color: "#FFFFFF" },
    accent: { fontFamily: PINYON, weight: 400, case: "sentence", sizeEm: 2.3, color: "#FFF4E0" },
    layout: "stack-left",
    leading: 0.88,
    accentOverlapEm: -0.3,
    shadow: SOFT_SHADOW,
    entrance: "rise",
  }),
  // 2. Ballet Note
  mixedStyle("ballet-note", "Ballet Note", "aesthetic", {
    base: { fontFamily: INSTRUMENT_SANS, weight: 700, case: "lower", sizeEm: 1, color: "#FFFFFF" },
    accent: { fontFamily: BALLET, weight: 400, case: "sentence", sizeEm: 2.6, color: "#FFFFFF" },
    layout: "stack-left",
    leading: 0.88,
    accentOverlapEm: -0.25,
    shadow: SOFT_SHADOW,
    entrance: "rise",
  }),
  // 3. Editorial Rose
  mixedStyle("editorial-rose", "Editorial Rose", "aesthetic", {
    base: { fontFamily: PLAYFAIR, weight: 700, case: "sentence", sizeEm: 1, color: "#FFFFFF" },
    accent: {
      fontFamily: PLAYFAIR,
      weight: 800,
      italic: true,
      case: "sentence",
      sizeEm: 1.5,
      color: "#F8C8D8",
    },
    layout: "stack-center",
    leading: 0.95,
    accentOverlapEm: -0.15,
    pill: { color: "#F25C9A", radius: "999px", paddingEm: "0.1em 0.45em", applyTo: "base" },
    shadow: SOFT_SHADOW,
    entrance: "fade",
  }),
  // 4. Film Title
  mixedStyle("film-title", "Film Title", "aesthetic", {
    base: {
      fontFamily: CORMORANT,
      weight: 600,
      case: "upper",
      sizeEm: 0.85,
      tracking: "0.14em",
      color: "#FFFFFF",
    },
    accent: {
      fontFamily: YELLOWTAIL,
      weight: 400,
      case: "sentence",
      sizeEm: 2.2,
      color: "#F5EC9B",
    },
    layout: "stack-center",
    leading: 0.92,
    accentOverlapEm: -0.2,
    shadow: "0 0 20px rgba(245,236,155,0.25)",
    entrance: "fade",
  }),
  // 5. Dreamy Serif
  mixedStyle("dreamy-serif", "Dreamy Serif", "aesthetic", {
    base: {
      fontFamily: INSTRUMENT_SERIF,
      weight: 400,
      case: "sentence",
      sizeEm: 1,
      color: "#FFF4E0",
    },
    accent: {
      fontFamily: INSTRUMENT_SERIF,
      weight: 400,
      italic: true,
      case: "sentence",
      sizeEm: 1.3,
      color: "#E8C98A",
    },
    layout: "stack-center",
    leading: 1.0,
    accentOverlapEm: -0.1,
    shadow: SOFT_SHADOW,
    entrance: "fade",
  }),
  // 6. Bold + Script
  mixedStyle("bold-script", "Bold + Script", "aesthetic", {
    base: { fontFamily: ANTON, weight: 400, case: "upper", sizeEm: 1, color: "#FFFFFF" },
    accent: {
      fontFamily: SACRAMENTO,
      weight: 400,
      case: "sentence",
      sizeEm: 2.2,
      color: "#FF5CA8",
    },
    layout: "stack-left",
    leading: 0.95,
    accentOverlapEm: -0.3,
    shadow: SOFT_SHADOW,
    entrance: "rise",
  }),
  // 7. Didone Fashion
  mixedStyle("didone-fashion", "Didone Fashion", "aesthetic", {
    base: {
      fontFamily: BODONI,
      weight: 700,
      case: "upper",
      sizeEm: 0.9,
      tracking: "0.12em",
      color: "#FFFFFF",
    },
    accent: {
      fontFamily: BODONI,
      weight: 400,
      italic: true,
      case: "sentence",
      sizeEm: 2.0,
      color: "#FFFFFF",
    },
    layout: "stack-center",
    leading: 0.92,
    accentOverlapEm: -0.2,
    shadow: SOFT_SHADOW,
    entrance: "fade",
  }),
  // 8. Retro Cooper
  mixedStyle("retro-cooper", "Retro Cooper", "aesthetic", {
    base: { fontFamily: CAPRASIMO, weight: 400, case: "sentence", sizeEm: 1, color: "#FFE9C7" },
    accent: { fontFamily: CAPRASIMO, weight: 400, case: "sentence", sizeEm: 1.3, color: "#FF7A3D" },
    layout: "stack-center",
    leading: 0.95,
    accentOverlapEm: -0.1,
    shadow: SOFT_SHADOW,
    outline: "0.04em #8B4513",
    entrance: "pop",
  }),
  // 9. Bubble Pink
  mixedStyle("bubble-pink", "Bubble Pink", "aesthetic", {
    base: { fontFamily: BAGEL, weight: 400, case: "lower", sizeEm: 1, color: "#FF9FCB" },
    accent: { fontFamily: BAGEL, weight: 400, case: "lower", sizeEm: 1.3, color: "#FFFFFF" },
    layout: "stack-center",
    leading: 0.95,
    accentOverlapEm: -0.1,
    shadow: SOFT_SHADOW,
    outline: "0.07em #FFFFFF",
    entrance: "pop",
  }),
  // 10. Spring Script
  mixedStyle("spring-script", "Spring Script", "aesthetic", {
    base: { fontFamily: SHRIKHAND, weight: 400, case: "sentence", sizeEm: 1, color: "#C9F27B" },
    accent: { fontFamily: SHRIKHAND, weight: 400, case: "sentence", sizeEm: 1.2, color: "#FFFFFF" },
    layout: "stack-center",
    leading: 0.95,
    accentOverlapEm: -0.1,
    shadow: SOFT_SHADOW,
    outline: "0.03em #1A3A1A",
    entrance: "pop",
  }),
  // 11. Sketch Tall
  mixedStyle("sketch-tall", "Sketch Tall", "aesthetic", {
    base: { fontFamily: AMATIC, weight: 700, case: "upper", sizeEm: 1, color: "#FFFFFF" },
    accent: { fontFamily: HOMEMADE, weight: 400, case: "sentence", sizeEm: 1.2, color: "#FFE566" },
    layout: "stack-center",
    leading: 1.0,
    accentOverlapEm: -0.1,
    shadow: SOFT_SHADOW,
    entrance: "rise",
  }),
  // 12. Cinzel Luxe
  mixedStyle("cinzel-luxe", "Cinzel Luxe", "aesthetic", {
    base: {
      fontFamily: CINZEL,
      weight: 600,
      case: "upper",
      sizeEm: 0.85,
      tracking: "0.18em",
      color: "#FFFFFF",
    },
    accent: {
      fontFamily: GREAT_VIBES,
      weight: 400,
      case: "sentence",
      sizeEm: 2.2,
      color: "#E6C27A",
    },
    layout: "stack-center",
    leading: 0.92,
    accentOverlapEm: -0.25,
    shadow: SOFT_SHADOW,
    entrance: "rise",
  }),
  // 13. Meow Diary
  mixedStyle("meow-diary", "Meow Diary", "aesthetic", {
    base: { fontFamily: INSTRUMENT_SANS, weight: 600, case: "lower", sizeEm: 1, color: "#FFFFFF" },
    accent: { fontFamily: MEOW, weight: 400, case: "sentence", sizeEm: 2.4, color: "#F8C8D8" },
    layout: "stack-left",
    leading: 0.88,
    accentOverlapEm: -0.3,
    shadow: SOFT_SHADOW,
    entrance: "rise",
  }),
  // 14. Imperial
  mixedStyle("imperial", "Imperial", "aesthetic", {
    base: { fontFamily: PLAYFAIR, weight: 600, case: "sentence", sizeEm: 1, color: "#FFFFFF" },
    accent: { fontFamily: IMPERIAL, weight: 400, case: "sentence", sizeEm: 2.6, color: "#FFFFFF" },
    layout: "stack-center",
    leading: 0.9,
    accentOverlapEm: -0.3,
    shadow: SOFT_SHADOW,
    entrance: "rise",
  }),
  // 15. Bungee Y2K
  mixedStyle("bungee-y2k", "Bungee Y2K", "aesthetic", {
    base: { fontFamily: BUNGEE, weight: 400, case: "upper", sizeEm: 1, color: "#FFFFFF" },
    accent: { fontFamily: BUNGEE, weight: 400, case: "upper", sizeEm: 1.15, color: "#C9F27B" },
    layout: "stack-center",
    leading: 1.0,
    accentOverlapEm: -0.05,
    shadow: "3px 3px 0px rgba(0,0,0,0.7), 0 2px 12px rgba(0,0,0,0.35)",
    entrance: "pop",
  }),

  // ═══════════════════════════════════════════════════════════════════════
  //  SOCIAL (18 styles)
  // ═══════════════════════════════════════════════════════════════════════
  simpleStyle("soc-pink-glow", "Pink Glow", "social", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: POPPINS,
    weight: 700,
    colorBase: "#FFFFFF",
    colorActive: "#FF69B4",
    colorEmphasis: "#FF69B4",
    shadow: "0 0 20px rgba(255,105,180,0.5), 0 2px 8px rgba(0,0,0,0.3)",
    entrance: "fade",
  }),
  simpleStyle("soc-white-box", "White Box", "social", "box-highlight", {
    ...defaultTokens,
    fontFamily: INTER,
    weight: 800,
    colorBase: "#000000",
    colorActive: "#000000",
    colorEmphasis: "#000000",
    box: { color: "#FFFFFF", radius: "0.1em", paddingEm: "0.1em 0.3em" },
    entrance: "fade",
  }),
  simpleStyle("soc-comic-blue", "Comic Blue", "social", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: BANGERS,
    weight: 400,
    italic: true,
    colorBase: "#000000",
    colorActive: "#6C5CE7",
    colorEmphasis: "#6C5CE7",
    strokeEm: 0.08,
    shadow: "0 2px 4px rgba(0,0,0,0.3)",
    entrance: "fade",
  }),
  simpleStyle("soc-magenta-outline", "Magenta Outline", "social", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: ANTON,
    weight: 400,
    uppercase: true,
    colorBase: "#FFFFFF",
    colorActive: "#FF00FF",
    colorEmphasis: "#FF00FF",
    strokeEm: 0.06,
    shadow: "0 2px 6px rgba(0,0,0,0.4)",
    entrance: "fade",
  }),
  simpleStyle("soc-mint-outline", "Mint Outline", "social", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: ANTON,
    weight: 400,
    uppercase: true,
    colorBase: "#FFFFFF",
    colorActive: "#00D2A0",
    colorEmphasis: "#00D2A0",
    strokeEm: 0.06,
    shadow: "0 2px 6px rgba(0,0,0,0.4)",
    entrance: "fade",
  }),
  simpleStyle("soc-violet-white", "Violet on White", "social", "box-highlight", {
    ...defaultTokens,
    fontFamily: INTER,
    weight: 800,
    uppercase: true,
    colorBase: "#000000",
    colorActive: "#7C3AED",
    colorEmphasis: "#7C3AED",
    box: { color: "#FFFFFF", radius: "0.1em", paddingEm: "0.1em 0.3em" },
    entrance: "fade",
  }),
  simpleStyle("soc-soft-white", "Soft White", "social", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: MONTSERRAT,
    weight: 600,
    uppercase: true,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 2px 10px rgba(0,0,0,0.3)",
    entrance: "fade",
  }),
  simpleStyle("soc-lime-pop", "Lime Pop", "social", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: POPPINS,
    weight: 700,
    colorBase: "#FFFFFF",
    colorActive: "#B6F23A",
    colorEmphasis: "#B6F23A",
    shadow: "0 2px 8px rgba(0,0,0,0.4)",
    entrance: "fade",
  }),
  simpleStyle("soc-heavy-outline", "Heavy Outline", "social", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: ANTON,
    weight: 400,
    uppercase: true,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    strokeEm: 0.08,
    shadow: "3px 3px 0px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.4)",
    entrance: "fade",
  }),
  simpleStyle("soc-gray-box-pink", "Gray Box Pink", "social", "box-highlight", {
    ...defaultTokens,
    fontFamily: INTER,
    weight: 700,
    colorBase: "#FFFFFF",
    colorActive: "#FF69B4",
    colorEmphasis: "#FF69B4",
    box: { color: "rgba(80,80,80,0.7)", radius: "0.1em", paddingEm: "0.1em 0.3em" },
    entrance: "fade",
  }),
  simpleStyle("soc-condensed-mint", "Condensed Mint", "social", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: BEBAS,
    weight: 400,
    colorBase: "#FFFFFF",
    colorActive: "#00D2A0",
    colorEmphasis: "#00D2A0",
    strokeEm: 0.05,
    shadow: "0 2px 6px rgba(0,0,0,0.4)",
    entrance: "fade",
  }),
  simpleStyle("soc-yellow-pop", "Yellow Pop", "social", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: INTER,
    weight: 800,
    colorBase: "#FFFFFF",
    colorActive: "#FACC15",
    colorEmphasis: "#FACC15",
    strokeEm: 0.05,
    shadow: "0 2px 6px rgba(0,0,0,0.4)",
    entrance: "fade",
  }),
  simpleStyle("soc-lime-box", "Lime Box", "social", "box-highlight", {
    ...defaultTokens,
    fontFamily: INTER,
    weight: 800,
    uppercase: true,
    colorBase: "#000000",
    colorActive: "#000000",
    colorEmphasis: "#000000",
    box: { color: "#B6F23A", radius: "0.1em", paddingEm: "0.1em 0.3em" },
    entrance: "fade",
  }),
  simpleStyle("soc-violet-pill", "Violet Pill", "social", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: POPPINS,
    weight: 700,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 2px 8px rgba(0,0,0,0.3)",
    entrance: "fade",
  }),
  simpleStyle("soc-haze", "Haze", "social", "glow-shadow", {
    ...defaultTokens,
    fontFamily: INTER,
    weight: 700,
    uppercase: true,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 0 20px rgba(255,255,255,0.5), 0 0 40px rgba(255,255,255,0.3)",
    entrance: "fade",
  }),
  simpleStyle("soc-neon-pink", "Neon Pink", "social", "glow-shadow", {
    ...defaultTokens,
    fontFamily: INTER,
    weight: 700,
    uppercase: true,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 0 10px #FF69B4, 0 0 20px #FF69B4, 0 0 40px #FF1493, 0 2px 8px rgba(0,0,0,0.3)",
    entrance: "fade",
  }),
  simpleStyle("soc-bubble-outline", "Bubble Outline", "social", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: BUNGEE,
    weight: 400,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    strokeEm: 0.08,
    shadow: "3px 3px 0px rgba(0,0,0,0.6)",
    entrance: "fade",
  }),
  simpleStyle("soc-lime-comic", "Lime Comic", "social", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: BANGERS,
    weight: 400,
    italic: true,
    colorBase: "#B6F23A",
    colorActive: "#B6F23A",
    colorEmphasis: "#B6F23A",
    strokeEm: 0.06,
    shadow: "2px 2px 0px rgba(0,0,0,0.8)",
    entrance: "fade",
  }),

  // ═══════════════════════════════════════════════════════════════════════
  //  BUSINESS (7 styles)
  // ═══════════════════════════════════════════════════════════════════════
  simpleStyle("biz-gray-box", "Gray Box", "business", "box-highlight", {
    ...defaultTokens,
    fontFamily: POPPINS,
    weight: 500,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    box: { color: "rgba(50,50,50,0.75)", radius: "0.15em", paddingEm: "0.15em 0.4em" },
    entrance: "fade",
  }),
  simpleStyle("biz-soft-shadow", "Soft Shadow", "business", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: POPPINS,
    weight: 600,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 2px 8px rgba(0,0,0,0.4)",
    entrance: "fade",
  }),
  simpleStyle("biz-bold-shadow", "Bold Shadow", "business", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: POPPINS,
    weight: 800,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "2px 2px 0px rgba(0,0,0,0.9), 0 2px 6px rgba(0,0,0,0.3)",
    entrance: "fade",
  }),
  simpleStyle("biz-soft-glow", "Soft Glow", "business", "glow-shadow", {
    ...defaultTokens,
    fontFamily: POPPINS,
    weight: 600,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 0 15px rgba(255,255,255,0.4), 0 2px 8px rgba(0,0,0,0.3)",
    entrance: "fade",
  }),
  simpleStyle("biz-light-box", "Light Box", "business", "box-highlight", {
    ...defaultTokens,
    fontFamily: POPPINS,
    weight: 700,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    box: { color: "rgba(100,100,100,0.6)", radius: "0.15em", paddingEm: "0.12em 0.35em" },
    entrance: "fade",
  }),
  simpleStyle("biz-heavy-glow", "Heavy Glow", "business", "glow-shadow", {
    ...defaultTokens,
    fontFamily: POPPINS,
    weight: 800,
    uppercase: true,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 0 8px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5)",
    entrance: "fade",
  }),
  simpleStyle("biz-heavy-shadow", "Heavy Shadow", "business", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: POPPINS,
    weight: 800,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 3px 6px rgba(0,0,0,0.5)",
    entrance: "fade",
  }),

  // ═══════════════════════════════════════════════════════════════════════
  //  RETRO (6 styles)
  // ═══════════════════════════════════════════════════════════════════════
  simpleStyle("ret-yellow-italic", "Yellow Italic", "retro", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: INTER,
    weight: 800,
    italic: true,
    colorBase: "#FACC15",
    colorActive: "#FACC15",
    colorEmphasis: "#FACC15",
    shadow: "3px 3px 0px rgba(0,0,0,0.9)",
    entrance: "fade",
  }),
  simpleStyle("ret-black-box", "Black Box", "retro", "box-highlight", {
    ...defaultTokens,
    fontFamily: INTER,
    weight: 800,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    box: { color: "#000000", radius: "0", paddingEm: "0.1em 0.3em" },
    entrance: "fade",
  }),
  simpleStyle("ret-yellow-heavy", "Yellow Heavy", "retro", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: INTER,
    weight: 900,
    colorBase: "#FACC15",
    colorActive: "#FACC15",
    colorEmphasis: "#FACC15",
    strokeEm: 0.06,
    shadow: "0 2px 4px rgba(0,0,0,0.5)",
    entrance: "fade",
  }),
  simpleStyle("ret-black-box-italic", "Black Box Italic", "retro", "box-highlight", {
    ...defaultTokens,
    fontFamily: INTER,
    weight: 400,
    italic: true,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    box: { color: "#000000", radius: "0", paddingEm: "0.1em 0.3em" },
    entrance: "fade",
  }),
  simpleStyle("ret-olive-yellow", "Olive Yellow", "retro", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: INTER,
    weight: 700,
    colorBase: "#8B8B00",
    colorActive: "#FACC15",
    colorEmphasis: "#FACC15",
    box: { color: "#000000", radius: "0", paddingEm: "0.1em 0.3em" },
    entrance: "fade",
  }),
  simpleStyle("ret-italic-serif", "Italic Serif", "retro", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: PLAYFAIR,
    weight: 800,
    italic: true,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "3px 3px 0px rgba(0,0,0,0.8), 0 2px 10px rgba(0,0,0,0.4)",
    entrance: "fade",
  }),

  // ═══════════════════════════════════════════════════════════════════════
  //  DYNAMIC (19 styles — Batch A+)
  // ═══════════════════════════════════════════════════════════════════════
  // a. Wide Fade
  simpleStyle("dyn-wide-fade", "Wide Fade", "dynamic", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: INSTRUMENT_SANS,
    weight: 400,
    colorBase: "rgba(255,255,255,0.5)",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 1px 4px rgba(0,0,0,0.2)",
    entrance: "fade",
  }),
  // b. Swipe Stack
  mixedStyle("dyn-swipe-stack", "Swipe Stack", "dynamic", {
    base: { fontFamily: INTER_TIGHT, weight: 800, case: "lower", sizeEm: 1, color: "#FFFFFF" },
    accent: { fontFamily: INTER_TIGHT, weight: 800, case: "lower", sizeEm: 1.6, color: "#FFFFFF" },
    layout: "stack-left",
    leading: 0.92,
    accentOverlapEm: -0.15,
    shadow: SOFT_SHADOW,
    entrance: "rise",
  }),
  // c. Glow Script
  mixedStyle("dyn-glow-script", "Glow Script", "dynamic", {
    base: {
      fontFamily: INSTRUMENT_SANS,
      weight: 400,
      case: "lower",
      sizeEm: 0.7,
      color: "rgba(255,255,255,0.6)",
    },
    accent: {
      fontFamily: PINYON,
      weight: 400,
      italic: true,
      case: "sentence",
      sizeEm: 2.4,
      color: "#FFFFFF",
    },
    layout: "stack-center",
    leading: 0.95,
    accentOverlapEm: -0.2,
    shadow: "0 0 20px rgba(255,255,255,0.5), 0 0 40px rgba(255,255,255,0.3)",
    entrance: "fade",
  }),
  // d. Gothic Pop
  mixedStyle("dyn-gothic-pop", "Gothic Pop", "dynamic", {
    base: { fontFamily: INTER_TIGHT, weight: 800, case: "upper", sizeEm: 1, color: "#FFFFFF" },
    accent: { fontFamily: PIRATA, weight: 400, case: "sentence", sizeEm: 2.0, color: "#FACC15" },
    layout: "stack-center",
    leading: 0.92,
    accentOverlapEm: -0.2,
    shadow: SOFT_SHADOW,
    entrance: "pop",
  }),
  // e. Label Stack
  mixedStyle("dyn-label-stack", "Label Stack", "dynamic", {
    base: { fontFamily: BEBAS, weight: 400, case: "upper", sizeEm: 1, color: "#FFFFFF" },
    accent: { fontFamily: BEBAS, weight: 400, case: "upper", sizeEm: 1.4, color: "#FACC15" },
    layout: "stack-left",
    leading: 1.0,
    accentOverlapEm: 0,
    shadow: SOFT_SHADOW,
    entrance: "rise",
  }),
  // f. Sticky Notes
  mixedStyle("dyn-sticky-notes", "Sticky Notes", "dynamic", {
    base: { fontFamily: POPPINS, weight: 600, case: "lower", sizeEm: 1, color: "#1A1A1A" },
    accent: {
      fontFamily: PINYON,
      weight: 400,
      italic: true,
      case: "sentence",
      sizeEm: 1.8,
      color: "#9B59B6",
    },
    layout: "inline",
    leading: 1.1,
    accentOverlapEm: 0,
    pill: { color: "#FFFFFF", radius: "12px", paddingEm: "0.1em 0.4em", applyTo: "base" },
    shadow: "0 1px 4px rgba(0,0,0,0.15)",
    entrance: "fade",
  }),
  // g. Soft Serif Fade
  simpleStyle("dyn-soft-serif-fade", "Soft Serif Fade", "dynamic", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: INSTRUMENT_SERIF,
    weight: 400,
    colorBase: "rgba(255,255,255,0.5)",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 2px 8px rgba(0,0,0,0.3)",
    entrance: "fade",
  }),
  // h. Orange Tag
  simpleStyle("dyn-orange-tag", "Orange Tag", "dynamic", "box-highlight", {
    ...defaultTokens,
    fontFamily: BEBAS,
    weight: 400,
    colorBase: "#000000",
    colorActive: "#000000",
    colorEmphasis: "#000000",
    box: { color: "#FF8C00", radius: "0", paddingEm: "0.12em 0.35em" },
    entrance: "fade",
  }),
  // i. Tiny Caps
  simpleStyle("dyn-tiny-caps", "Tiny Caps", "dynamic", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: INTER,
    weight: 600,
    uppercase: true,
    colorBase: "rgba(255,255,255,0.7)",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 1px 3px rgba(0,0,0,0.2)",
    entrance: "fade",
  }),
  // j. Tag Pop
  simpleStyle("dyn-tag-pop", "Tag Pop", "dynamic", "box-highlight", {
    ...defaultTokens,
    fontFamily: INTER_TIGHT,
    weight: 800,
    colorBase: "#000000",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    box: { color: "#FACC15", radius: "0.1em", paddingEm: "0.12em 0.35em" },
    entrance: "pop",
  }),
  // k. Outline Caps
  simpleStyle("dyn-outline-caps", "Outline Caps", "dynamic", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: INTER_TIGHT,
    weight: 800,
    uppercase: true,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    strokeEm: 0.06,
    shadow: "0 2px 8px rgba(0,0,0,0.4)",
    entrance: "fade",
  }),
  // l. Sans + Serif Accent
  mixedStyle("dyn-sans-serif-accent", "Sans + Serif Accent", "dynamic", {
    base: { fontFamily: INTER_TIGHT, weight: 700, case: "lower", sizeEm: 1, color: "#FFFFFF" },
    accent: {
      fontFamily: PLAYFAIR,
      weight: 700,
      italic: true,
      case: "sentence",
      sizeEm: 1.5,
      color: "#FACC15",
    },
    layout: "inline",
    leading: 1.0,
    accentOverlapEm: 0,
    shadow: SOFT_SHADOW,
    entrance: "fade",
  }),
  // m. Giant Serif Accent
  mixedStyle("dyn-giant-serif", "Giant Serif Accent", "dynamic", {
    base: {
      fontFamily: INSTRUMENT_SANS,
      weight: 600,
      case: "lower",
      sizeEm: 0.7,
      color: "#FFFFFF",
    },
    accent: { fontFamily: PLAYFAIR, weight: 800, case: "sentence", sizeEm: 2.8, color: "#FFFFFF" },
    layout: "stack-center",
    leading: 0.85,
    accentOverlapEm: -0.3,
    shadow: SOFT_SHADOW,
    entrance: "rise",
  }),
  // n. Handwrite + Bold
  mixedStyle("dyn-handwrite-bold", "Handwrite + Bold", "dynamic", {
    base: { fontFamily: CAVEAT, weight: 400, case: "sentence", sizeEm: 0.9, color: "#FFFFFF" },
    accent: { fontFamily: INTER_TIGHT, weight: 800, case: "lower", sizeEm: 1.4, color: "#FACC15" },
    layout: "stack-left",
    leading: 0.95,
    accentOverlapEm: -0.1,
    shadow: SOFT_SHADOW,
    entrance: "rise",
  }),
  // o. Terminal
  simpleStyle("dyn-terminal", "Terminal", "dynamic", "box-highlight", {
    ...defaultTokens,
    fontFamily: COURIER,
    weight: 400,
    colorBase: "#00FF41",
    colorActive: "#00FF41",
    colorEmphasis: "#00FF41",
    box: { color: "rgba(0,0,0,0.85)", radius: "0.1em", paddingEm: "0.15em 0.4em" },
    entrance: "fade",
  }),
  // p. Script Pop
  mixedStyle("dyn-script-pop", "Script Pop", "dynamic", {
    base: { fontFamily: INTER_TIGHT, weight: 800, case: "lower", sizeEm: 1, color: "#FFFFFF" },
    accent: {
      fontFamily: YELLOWTAIL,
      weight: 400,
      italic: true,
      case: "sentence",
      sizeEm: 2.2,
      color: "#C9F27B",
    },
    layout: "stack-left",
    leading: 0.9,
    accentOverlapEm: -0.25,
    shadow: SOFT_SHADOW,
    entrance: "rise",
  }),
  // q. Lime Script Lead
  mixedStyle("dyn-lime-script-lead", "Lime Script Lead", "dynamic", {
    base: {
      fontFamily: INSTRUMENT_SANS,
      weight: 600,
      case: "lower",
      sizeEm: 0.8,
      color: "#FFFFFF",
    },
    accent: {
      fontFamily: YELLOWTAIL,
      weight: 400,
      case: "sentence",
      sizeEm: 2.4,
      color: "#C9F27B",
    },
    layout: "stack-left",
    leading: 0.88,
    accentOverlapEm: -0.25,
    shadow: SOFT_SHADOW,
    entrance: "rise",
  }),
  // r. Tight Serif
  mixedStyle("dyn-tight-serif", "Tight Serif", "dynamic", {
    base: { fontFamily: PLAYFAIR, weight: 400, case: "sentence", sizeEm: 1, color: "#FFFFFF" },
    accent: { fontFamily: PLAYFAIR, weight: 400, case: "sentence", sizeEm: 1.2, color: "#FFFFFF" },
    layout: "stack-center",
    leading: 0.85,
    accentOverlapEm: -0.15,
    shadow: SOFT_SHADOW,
    entrance: "fade",
  }),
  // s. Super Stretch
  mixedStyle("dyn-super-stretch", "Super Stretch", "dynamic", {
    base: {
      fontFamily: INTER_TIGHT,
      weight: 800,
      italic: true,
      case: "lower",
      sizeEm: 1,
      color: "#C9F27B",
    },
    accent: {
      fontFamily: INTER_TIGHT,
      weight: 800,
      italic: true,
      case: "lower",
      sizeEm: 1.3,
      color: "#C9F27B",
    },
    layout: "stack-center",
    leading: 0.95,
    accentOverlapEm: -0.1,
    shadow: SOFT_SHADOW,
    entrance: "pop",
  }),

  // ═══════════════════════════════════════════════════════════════════════
  //  CLASSIC (reassigned to BUSINESS)
  // ═══════════════════════════════════════════════════════════════════════
  simpleStyle("classic-shadow", "White Bold Shadow", "business", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: INTER,
    weight: 800,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 2px 8px rgba(0,0,0,0.5)",
    entrance: "fade",
  }),
  simpleStyle("classic-box", "Black Box", "business", "box-highlight", {
    ...defaultTokens,
    fontFamily: INTER,
    weight: 700,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    box: { color: "rgba(0,0,0,0.75)", radius: "0.15em", paddingEm: "0.15em 0.4em" },
    entrance: "fade",
  }),
  simpleStyle("classic-karaoke", "Yellow Karaoke", "business", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: INTER,
    weight: 800,
    colorBase: "#FFFFFF",
    colorActive: "#FACC15",
    colorEmphasis: "#FACC15",
    shadow: "0 2px 6px rgba(0,0,0,0.5)",
    entrance: "fade",
  }),
  simpleStyle("classic-clean", "Clean Shadow", "business", "karaoke-fill", {
    ...defaultTokens,
    fontFamily: INSTRUMENT_SANS,
    weight: 600,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 1px 4px rgba(0,0,0,0.4)",
    entrance: "fade",
  }),
];
