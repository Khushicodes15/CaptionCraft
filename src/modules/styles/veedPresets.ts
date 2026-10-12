import type { CaptionStyle, StyleTokens, MixedTypeTokens } from "./types";
import { LEGACY_FONT_FAMILIES_TO_PRELOAD } from "./legacyPresets"; // For now we won't reinvent fonts, we use existing or document.

// â”€â”€ Font Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Using the existing loaded fonts from presets.ts to match the visuals
const INTER = "'Inter', system-ui, sans-serif";
const INTER_TIGHT = "'Inter Tight', system-ui, sans-serif";
const INSTRUMENT_SANS = "'Instrument Sans', sans-serif";
const POPPINS = "'Poppins', sans-serif";
const MONTSERRAT = "'Montserrat', sans-serif";
const BEBAS = "'Bebas Neue', sans-serif";
const ANTON = "'Anton', sans-serif";
const BANGERS = "'Bangers', cursive";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const INSTRUMENT_SERIF = "'Instrument Serif', serif";
const BODONI = "'Bodoni Moda', serif";
const CORMORANT = "'Cormorant Garamond', serif";
const COURIER = "'Courier Prime', monospace";
const YELLOWTAIL = "'Yellowtail', cursive";
const CAVEAT = "'Caveat', cursive";
const CAPRASIMO = "'Caprasimo', cursive";
const HOMEMADE = "'Homemade Apple', cursive";
const GREAT_VIBES = "'Great Vibes', cursive";
const PINYON_SCRIPT = "'Pinyon Script', cursive";
const CREEPSTER = "'Creepster', cursive";

const SOFT_SHADOW = "0 2px 12px rgba(0,0,0,0.35)";

export const VEED_FONT_FAMILIES_TO_PRELOAD = [
  // These will be merged in the registry.
  // If we added new fonts, we'd list them here.
];

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function veedSimpleStyle(
  id: string,
  name: string,
  category: CaptionStyle["category"],
  engine: CaptionStyle["engine"],
  tokens: StyleTokens,
  capabilities: Partial<CaptionStyle["capabilities"]> = {},
): CaptionStyle {
  return {
    id,
    name,
    category,
    engine,
    tokens,
    capabilities: {
      supportsFontOverride: true,
      supportsWeightOverride: true,
      supportsColorOverride: true,
      supportsEmphasis: true,
      supportsActiveWord: true,
      supportsBackground: true,
      supportsOutline: true,
      supportsShadow: true,
      supportsAnimation: true,
      supportsWholeCaptionAnimation: true,
      supportsWordAnimation: true,
      ...capabilities,
    },
  };
}

function veedMixedStyle(
  id: string,
  name: string,
  category: CaptionStyle["category"],
  mixed: MixedTypeTokens,
  capabilities: Partial<CaptionStyle["capabilities"]> = {},
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
      // Dynamic styles usually lock fonts to preserve the design hierarchy
      supportsFontOverride: false,
      supportsWeightOverride: false,
      supportsColorOverride: true,
      supportsEmphasis: true,
      supportsActiveWord: true,
      supportsBackground: false,
      supportsOutline: true,
      supportsShadow: true,
      supportsAnimation: true,
      supportsWholeCaptionAnimation: true,
      supportsWordAnimation: true,
      ...capabilities,
    },
  };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  DYNAMIC (24 styles)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export const VEED_CAPTION_STYLES: CaptionStyle[] = [
  // D01 — HUGE CONDENSED IMPACT
  veedMixedStyle("dyn-01-huge-condensed", "Huge Condensed", "dynamic", {
    base: { fontFamily: ANTON, weight: 400, case: "upper", sizeEm: 1, color: "#FFFFFF" },
    accent: { fontFamily: ANTON, weight: 400, case: "upper", sizeEm: 1.4, color: "#FFFFFF" },
    layout: "stack-center",
    leading: 0.85,
    accentOverlapEm: -0.1,
    shadow: "0 10px 30px rgba(0,0,0,0.8)",
    entrance: "pop",
  }),
  // D02 — SMALL ELEGANT ITALIC
  veedMixedStyle("dyn-02-small-italic", "Small Italic", "dynamic", {
    base: {
      fontFamily: PLAYFAIR,
      weight: 400,
      italic: true,
      case: "sentence",
      sizeEm: 0.4,
      color: "#FFFFFF",
    },
    accent: {
      fontFamily: PLAYFAIR,
      weight: 400,
      italic: true,
      case: "sentence",
      sizeEm: 0.45,
      color: "#FFFFFF",
    },
    layout: "stack-center",
    leading: 1.1,
    accentOverlapEm: 0,
    shadow: "0 1px 2px rgba(0,0,0,0.5)",
    entrance: "fade",
  }),
  // D03 — MINIMAL THIN SANS
  veedMixedStyle("dyn-03-minimal-thin", "Minimal Thin", "dynamic", {
    base: { fontFamily: INTER_TIGHT, weight: 300, case: "sentence", sizeEm: 0.6, color: "rgba(255,255,255,0.4)", colorActive: "#FFFFFF", colorPast: "#FFFFFF" },
    accent: { fontFamily: INTER_TIGHT, weight: 300, case: "sentence", sizeEm: 0.8, color: "rgba(255,255,255,0.4)", colorActive: "#FFFFFF", colorPast: "#FFFFFF" },
    layout: "stack-center",
    leading: 1.1,
    accentOverlapEm: 0,
    shadow: "0 1px 2px rgba(0,0,0,0.4)",
    entrance: "fade",
  }),
  // D04 — WIDE TRACKED MONOSPACE / EDITORIAL
  veedMixedStyle("dyn-04-wide-tracked", "Wide Tracked", "dynamic", {
    base: {
      fontFamily: INTER,
      weight: 400,
      case: "lower",
      sizeEm: 0.7,
      tracking: "0.2em",
      color: "#FFFFFF",
    },
    accent: {
      fontFamily: INTER,
      weight: 700,
      case: "lower",
      sizeEm: 0.8,
      tracking: "0.2em",
      color: "#FFFFFF",
    },
    layout: "stack-center",
    leading: 1.4,
    accentOverlapEm: 0,
    shadow: "0 2px 8px rgba(0,0,0,0.4)",
    entrance: "fade",
  }),
  // D05 — CHUNKY WORD-STACK EMPHASIS
  veedMixedStyle("dyn-05-chunky-stack", "Chunky Stack", "dynamic", {
    base: { fontFamily: POPPINS, weight: 900, case: "upper", sizeEm: 1, color: "#FFFFFF" },
    accent: { fontFamily: POPPINS, weight: 900, case: "upper", sizeEm: 1.8, color: "#FFFFFF" },
    layout: "stack-center",
    lineBreakMode: "every-word",
    leading: 0.85,
    accentOverlapEm: 0,
    shadow: "0 4px 15px rgba(0,0,0,0.6)",
    outline: "0.02em #000000",
    entrance: "pop",
  }),
  // D06 — HANDWRITTEN / CALLIGRAPHIC
  veedMixedStyle("dyn-06-calligraphic", "Calligraphic", "dynamic", {
    base: {
      fontFamily: PLAYFAIR,
      weight: 600,
      italic: false,
      case: "sentence",
      sizeEm: 0.6,
      color: "#FFFFFF",
    },
    accent: {
      fontFamily: PINYON_SCRIPT,
      weight: 400,
      case: "sentence",
      sizeEm: 3.8, // Bigger script
      color: "#FFFFFF",
      tracking: "-0.05em",
    },
    layout: "stack-center", // Better for natural flow
    lineBreakMode: "auto", // Do NOT isolate the word, keep semantic reading order
    layering: "normal",
    leading: 1.1,
    accentOverlapEm: 0, // No negative line margin needed if they are inline
    shadow: "0 2px 10px rgba(0,0,0,0.5)",
    entrance: "fade",
  }),
  // D07 — HEAVY DISPLAY SERIF / SLAB
  veedMixedStyle("dyn-07-heavy-serif", "Heavy Serif", "dynamic", {
    base: { fontFamily: BODONI, weight: 700, case: "upper", sizeEm: 0.8, color: "#FACC15" },
    accent: { fontFamily: BODONI, weight: 700, case: "upper", sizeEm: 1.2, color: "#FACC15" },
    layout: "stack-center",
    leading: 0.95,
    accentOverlapEm: 0,
    shadow: "0 4px 12px rgba(0,0,0,0.7)",
    entrance: "pop",
  }),
  // D08 — BOLD DISPLAY + SMALL SECONDARY TEXT
  veedMixedStyle("dyn-08-display-secondary", "Display Secondary", "dynamic", {
    base: {
      fontFamily: INTER_TIGHT,
      weight: 400,
      case: "upper",
      sizeEm: 0.45,
      color: "#FFFFFF",
      tracking: "0.1em",
    },
    accent: { fontFamily: ANTON, weight: 400, case: "upper", sizeEm: 1.5, color: "#FACC15" },
    layout: "stack-center",
    lineBreakMode: "accent-isolated",
    leading: 0.9,
    accentOverlapEm: -0.05,
    shadow: "0 4px 12px rgba(0,0,0,0.7)",
    entrance: "pop",
  }),
  // D09 — ROUNDED PURPLE WORD BOXES
  veedMixedStyle("dyn-09-purple-boxes", "Purple Boxes", "dynamic", {
    base: { fontFamily: INTER_TIGHT, weight: 700, case: "lower", sizeEm: 0.8, color: "#000000" },
    accent: { fontFamily: INTER_TIGHT, weight: 800, case: "lower", sizeEm: 1, color: "#FFFFFF" },
    layout: "inline",
    leading: 1.2,
    accentOverlapEm: 0,
    shadow: "0 2px 4px rgba(0,0,0,0.2)",
    pill: { color: "#8B5CF6", radius: "0.35em", paddingEm: "0.12em 0.3em", applyTo: "accent", colorBase: "#FFF8F2" },
    entrance: "fade",
  }),
  // D10 — TINY ELEGANT SERIF
  veedMixedStyle("dyn-10-tiny-serif", "Tiny Serif", "dynamic", {
    base: { fontFamily: CORMORANT, weight: 600, case: "sentence", sizeEm: 0.5, color: "#FFFFFF" },
    accent: {
      fontFamily: CORMORANT,
      weight: 700,
      italic: true,
      case: "sentence",
      sizeEm: 0.6,
      color: "#FFFFFF",
    },
    layout: "stack-center",
    leading: 1.1,
    accentOverlapEm: 0,
    shadow: "0 1px 3px rgba(0,0,0,0.5)",
    entrance: "fade",
  }),
  // D11 — RETRO YELLOW ITALIC DISPLAY
  veedMixedStyle("dyn-11-retro-italic", "Retro Italic", "dynamic", {
    base: {
      fontFamily: INSTRUMENT_SANS,
      weight: 800,
      italic: true,
      case: "sentence",
      sizeEm: 0.8,
      color: "#FACC15",
    },
    accent: {
      fontFamily: INSTRUMENT_SANS,
      weight: 800,
      italic: true,
      case: "sentence",
      sizeEm: 1.1,
      color: "#FACC15",
    },
    layout: "stack-center",
    leading: 1.0,
    accentOverlapEm: 0,
    shadow: "0 2px 8px rgba(0,0,0,0.6)",
    entrance: "rise",
  }),
  // D12 — ORANGE/BLACK STICKER TYPOGRAPHY
  veedMixedStyle("dyn-12-orange-sticker", "Orange Sticker", "dynamic", {
    base: { fontFamily: BEBAS, weight: 400, case: "upper", sizeEm: 0.6, color: "#FFFFFF" },
    accent: { fontFamily: BEBAS, weight: 400, case: "upper", sizeEm: 1.8, color: "#000000" },
    layout: "stack-center",
    lineBreakMode: "accent-isolated",
    leading: 1.1,
    accentOverlapEm: 0,
    shadow: "0 4px 10px rgba(0,0,0,0.4)",
    pill: { color: "#F97316", radius: "0", paddingEm: "0.05em 0.2em", applyTo: "accent" },
    entrance: "pop",
  }),
  // D13 — RED / YELLOW / WHITE NEWS-STICKER
  veedMixedStyle("dyn-13-news-sticker", "News Sticker", "dynamic", {
    base: { fontFamily: ANTON, weight: 400, case: "upper", sizeEm: 0.9, color: "#000000" },
    accent: { fontFamily: ANTON, weight: 400, case: "upper", sizeEm: 1.25, color: "#000000" },
    layout: "stack-left",
    lineBreakMode: "news-blocks",
    leading: 1.1,
    accentOverlapEm: 0,
    shadow: "none",
    pill: {
      color: "#FFFFFF",
      radius: "0",
      paddingEm: "0.12em 0.35em",
      applyTo: "all",
      colorAccent: "#FACC15",
      boxShadow: "0 3px 0 rgba(0,0,0,0.85)",
    },
    entrance: "fade",
  }),
  // D14 — THIN ALL-CAPS EDITORIAL
  veedMixedStyle("dyn-14-thin-caps", "Thin Caps", "dynamic", {
    base: {
      fontFamily: INTER_TIGHT,
      weight: 400,
      case: "upper",
      sizeEm: 0.7,
      tracking: "0.15em",
      color: "#FFFFFF",
    },
    accent: {
      fontFamily: INTER_TIGHT,
      weight: 700,
      case: "upper",
      sizeEm: 0.8,
      tracking: "0.15em",
      color: "#FFFFFF",
    },
    layout: "stack-center",
    leading: 1.2,
    accentOverlapEm: 0,
    shadow: "0 1px 4px rgba(0,0,0,0.5)",
    entrance: "fade",
  }),
  // D15 — ELEGANT SERIF WITH YELLOW EMPHASIS
  veedMixedStyle("dyn-15-serif-yellow", "Serif Yellow", "dynamic", {
    base: { fontFamily: PLAYFAIR, weight: 600, case: "sentence", sizeEm: 0.8, color: "#FFFFFF" },
    accent: {
      fontFamily: PLAYFAIR,
      weight: 700,
      italic: true,
      case: "sentence",
      sizeEm: 0.9,
      color: "#FACC15",
    },
    layout: "stack-center",
    leading: 1.1,
    accentOverlapEm: 0,
    shadow: "0 2px 6px rgba(0,0,0,0.5)",
    entrance: "fade",
  }),
  // D16 — SMALL MINIMAL CAPTION
  veedMixedStyle("dyn-16-small-minimal", "Small Minimal", "dynamic", {
    base: { fontFamily: INTER, weight: 400, case: "sentence", sizeEm: 0.5, color: "#FFFFFF" },
    accent: { fontFamily: INTER, weight: 600, case: "sentence", sizeEm: 0.55, color: "#FFFFFF" },
    layout: "stack-center",
    leading: 1.3,
    accentOverlapEm: 0,
    shadow: "0 1px 2px rgba(0,0,0,0.4)",
    entrance: "fade",
  }),
  // D17 — ELEGANT SCRIPT + SERIF MIX
  veedMixedStyle("dyn-17-script-serif", "Script & Serif", "dynamic", {
    base: { fontFamily: HOMEMADE, weight: 400, case: "sentence", sizeEm: 0.8, color: "#FFFFFF" },
    accent: { fontFamily: ANTON, weight: 400, case: "upper", sizeEm: 1.5, color: "#FACC15" },
    layout: "stack-center",
    lineBreakMode: "accent-isolated",
    leading: 1.1,
    accentOverlapEm: 0,
    shadow: "0 2px 8px rgba(0,0,0,0.6)",
    entrance: "rise",
  }),
  // D18 — LARGE COLORFUL WORD EMPHASIS
  veedMixedStyle("dyn-18-large-colorful", "Large Colorful", "dynamic", {
    base: { fontFamily: INTER_TIGHT, weight: 700, case: "lower", sizeEm: 0.8, color: "#FFFFFF" },
    accent: { fontFamily: CAPRASIMO, weight: 400, case: "lower", sizeEm: 1.8, color: "#EC4899" },
    layout: "stack-center",
    lineBreakMode: "accent-isolated",
    leading: 0.9,
    accentOverlapEm: -0.1,
    shadow: "0 3px 10px rgba(0,0,0,0.5)",
    entrance: "pop",
  }),
  // D19 — SMALL SERIF SUBTITLE
  veedMixedStyle("dyn-19-small-subtitle", "Small Subtitle", "dynamic", {
    base: { fontFamily: PLAYFAIR, weight: 400, case: "sentence", sizeEm: 0.6, color: "#FFFFFF" },
    accent: { fontFamily: PLAYFAIR, weight: 600, case: "sentence", sizeEm: 0.65, color: "#FFFFFF" },
    layout: "stack-center",
    leading: 1.2,
    accentOverlapEm: 0,
    shadow: "0 1px 3px rgba(0,0,0,0.6)",
    entrance: "fade",
  }),
  // D20 — PLAYFUL MIXED-SIZE WORDS
  veedMixedStyle("dyn-20-playful-mixed", "Playful Mixed", "dynamic", {
    base: { fontFamily: POPPINS, weight: 700, case: "lower", sizeEm: 0.8, color: "#FFFFFF" },
    accent: { fontFamily: CAPRASIMO, weight: 400, case: "lower", sizeEm: 1.5, color: "#FACC15" },
    layout: "stack-center",
    lineBreakMode: "every-word",
    leading: 1.15,
    accentOverlapEm: 0,
    shadow: "0 3px 8px rgba(0,0,0,0.4)",
    entrance: "pop",
  }),
  // D21 — SMALL GREEN EMPHASIS
  veedMixedStyle("dyn-21-green-emphasis", "Green Emphasis", "dynamic", {
    base: { fontFamily: INTER, weight: 500, case: "sentence", sizeEm: 0.6, color: "#FFFFFF" },
    accent: { fontFamily: INTER, weight: 700, case: "sentence", sizeEm: 0.7, color: "#22C55E" },
    layout: "stack-center",
    leading: 1.2,
    accentOverlapEm: 0,
    shadow: "0 2px 5px rgba(0,0,0,0.4)",
    entrance: "fade",
  }),
  // D22 — GIANT SOFT WHITE TYPOGRAPHY
  veedMixedStyle("dyn-22-giant-soft", "Giant Soft", "dynamic", {
    base: { fontFamily: POPPINS, weight: 800, case: "lower", sizeEm: 1, color: "#FFFFFF" },
    accent: { fontFamily: POPPINS, weight: 900, case: "lower", sizeEm: 1.6, color: "#FFFFFF" },
    layout: "stack-center",
    leading: 0.9,
    accentOverlapEm: 0,
    shadow: "0 5px 20px rgba(0,0,0,0.3)",
    entrance: "rise",
  }),
  // D23 — WHITE + YELLOW SCRIPT
  veedMixedStyle("dyn-23-yellow-script", "Yellow Script", "dynamic", {
    base: { fontFamily: INTER_TIGHT, weight: 800, case: "lower", sizeEm: 0.8, color: "#FACC15" },
    accent: { fontFamily: YELLOWTAIL, weight: 400, case: "sentence", sizeEm: 1.8, color: "#FFFFFF" },
    layout: "stack-center",
    lineBreakMode: "accent-isolated",
    leading: 1.1,
    accentOverlapEm: 0,
    shadow: "0 0 10px rgba(255,255,255,0.5), 0 2px 6px rgba(0,0,0,0.5)",
    entrance: "rise",
  }),
  // D24 — WHITE + GREEN SCRIPT
  veedMixedStyle("dyn-24-green-script", "Green Script", "dynamic", {
    base: { fontFamily: CREEPSTER, weight: 400, case: "upper", sizeEm: 1.2, color: "#22C55E" },
    accent: { fontFamily: CREEPSTER, weight: 400, case: "upper", sizeEm: 1.3, color: "#FFFFFF" },
    layout: "stack-center",
    lineBreakMode: "accent-isolated",
    leading: 1.1,
    accentOverlapEm: 0,
    shadow: "0 2px 6px rgba(0,0,0,0.5)",
    entrance: "rise",
  }),

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  SOCIAL (18 styles)
  //
  // S01: White bold sans. Soft shadow.
  veedSimpleStyle("soc-01-white-shadow", "White Shadow", "social", "karaoke-fill", {
    fontFamily: POPPINS,
    weight: 700,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 2px 10px rgba(0,0,0,0.5)",
    entrance: "pop",
  }),
  // S02: Black bold sans. White rounded bg.
  veedSimpleStyle("soc-02-black-on-white", "Black on White", "social", "box-highlight", {
    fontFamily: INTER,
    weight: 800,
    colorBase: "#000000",
    colorActive: "#000000",
    colorEmphasis: "#000000",
    box: { color: "#FFFFFF", radius: "0.2em", paddingEm: "0.1em 0.3em" },
    entrance: "pop",
  }),
  // S03: Comic bold. White text, black stroke. Blue spoken-word highlight.
  veedSimpleStyle("soc-03-comic-blue", "Comic Blue", "social", "karaoke-fill", {
    fontFamily: BANGERS,
    weight: 400,
    colorBase: "#FFFFFF",
    colorActive: "#3B82F6",
    colorEmphasis: "#FFFFFF",
    strokeEm: 0.07,
    shadow: "2px 2px 0px rgba(0,0,0,0.9)",
    entrance: "pop",
  }),
  // S04: Comic bold. White text, black stroke. Pink spoken-word highlight.
  veedSimpleStyle("soc-04-comic-pink", "Comic Pink", "social", "karaoke-fill", {
    fontFamily: BANGERS,
    weight: 400,
    colorBase: "#FFFFFF",
    colorActive: "#EC4899",
    colorEmphasis: "#FFFFFF",
    strokeEm: 0.08,
    shadow: "2px 2px 0px rgba(0,0,0,0.9)",
    entrance: "pop",
  }),
  // S05: Comic bold. White text, black stroke. Teal spoken-word highlight.
  veedSimpleStyle("soc-05-comic-teal", "Comic Teal", "social", "karaoke-fill", {
    fontFamily: BANGERS,
    weight: 400,
    colorBase: "#FFFFFF",
    colorActive: "#00D2A0",
    colorEmphasis: "#FFFFFF",
    strokeEm: 0.08,
    shadow: "2px 2px 0px rgba(0,0,0,0.9)",
    entrance: "pop",
  }),
  // S06: White text. White box with purple tint on active.
  veedSimpleStyle("soc-06-white-box-purple", "White Box Purple", "social", "box-highlight", {
    fontFamily: INTER_TIGHT,
    weight: 800,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    box: { color: "#8B5CF6", radius: "0.2em", paddingEm: "0.1em 0.3em" },
    entrance: "pop",
  }),
  // S07: White bold uppercase.
  veedSimpleStyle("soc-07-white-bold", "White Bold", "social", "karaoke-fill", {
    fontFamily: INTER_TIGHT,
    weight: 800,
    uppercase: true,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 2px 10px rgba(0,0,0,0.6)",
    entrance: "pop",
  }),
  // S08: White bold. Uniform color.
  veedSimpleStyle("soc-08-white-green", "White & Green", "social", "karaoke-fill", {
    fontFamily: INTER_TIGHT,
    weight: 800,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 2px 8px rgba(0,0,0,0.5)",
    entrance: "pop",
  }),
  // S09: Viral white outline.
  veedSimpleStyle("soc-09-black-white-outline", "Viral Outline", "social", "karaoke-fill", {
    fontFamily: ANTON,
    weight: 400,
    uppercase: true,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    strokeEm: 0.15,
    shadow: "0 0.1em 0.1em rgba(0,0,0,1)",
    entrance: "pop",
  }),
  // S10: Dark box. White text.
  veedSimpleStyle("soc-10-dark-box-pink", "Dark Box Pink", "social", "box-highlight", {
    fontFamily: INTER,
    weight: 700,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    box: { color: "#222222", radius: "0.1em", paddingEm: "0.1em 0.3em" },
    entrance: "pop",
  }),
  // S11: Cyan outline. White text.
  veedSimpleStyle("soc-11-white-cyan-outline", "Cyan Outline", "social", "karaoke-fill", {
    fontFamily: INTER_TIGHT,
    weight: 800,
    uppercase: true,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    strokeEm: 0.06,
    shadow: "3px 3px 0px rgba(0,0,0,0.8)",
    entrance: "pop",
  }),
  // S12: Yellow Highlight - black text, uniform.
  veedSimpleStyle("soc-12-black-white-yellow", "Yellow Highlight", "social", "karaoke-fill", {
    fontFamily: INTER_TIGHT,
    weight: 800,
    colorBase: "#000000",
    colorActive: "#000000",
    colorEmphasis: "#000000",
    strokeEm: 0.06,
    shadow: "none",
    entrance: "pop",
  }),
  // S13: Neon green box. Black text.
  veedSimpleStyle("soc-13-neon-green-box", "Neon Green Box", "social", "box-highlight", {
    fontFamily: INTER_TIGHT,
    weight: 800,
    uppercase: true,
    colorBase: "#000000",
    colorActive: "#000000",
    colorEmphasis: "#000000",
    box: { color: "#22C55E", radius: "0", paddingEm: "0.1em 0.3em" },
    entrance: "pop",
  }),
  // S14: Purple pill. White text.
  veedSimpleStyle("soc-14-purple-pill", "Purple Pill", "social", "box-highlight", {
    fontFamily: INTER,
    weight: 700,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    box: { color: "#8B5CF6", radius: "1em", paddingEm: "0.1em 0.4em" },
    entrance: "pop",
  }),
  // S15: Minimal clean. White text.
  veedSimpleStyle("soc-15-minimal-clean", "Minimal Clean", "social", "karaoke-fill", {
    fontFamily: INTER,
    weight: 700,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 1px 4px rgba(0,0,0,0.3)",
    entrance: "fade",
  }),
  // S16: Pink glow. White text.
  veedSimpleStyle("soc-16-pink-glow", "Pink Glow", "social", "glow-shadow", {
    fontFamily: INTER_TIGHT,
    weight: 800,
    uppercase: true,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 0 15px #FF69B4",
    entrance: "pop",
  }),
  // S17: Heavy viral. White text.
  veedSimpleStyle("soc-17-heavy-viral", "Heavy Viral", "social", "karaoke-fill", {
    fontFamily: "'Impact', Anton, sans-serif",
    weight: 900,
    uppercase: true,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    strokeEm: 0.1,
    shadow: "none",
    entrance: "pop",
  }),
  // S18: Green comic. Uniform green.
  veedSimpleStyle("soc-18-green-comic", "Green Comic", "social", "karaoke-fill", {
    fontFamily: BANGERS,
    weight: 400,
    colorBase: "#22C55E",
    colorActive: "#22C55E",
    colorEmphasis: "#22C55E",
    strokeEm: 0.05,
    shadow: "2px 2px 0px rgba(0,0,0,0.8)",
    entrance: "pop",
  }),

  //BUSINESS (7 styles)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  veedSimpleStyle("biz-01-dark-gray-box", "Dark Gray Box", "business", "box-highlight", {
    fontFamily: INTER,
    weight: 500,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    box: { color: "#333333", radius: "0.2em", paddingEm: "0.15em 0.3em" },
    entrance: "fade",
  }),
  veedSimpleStyle("biz-02-clean-shadow", "Clean Shadow", "business", "karaoke-fill", {
    fontFamily: INTER,
    weight: 500,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 2px 8px rgba(0,0,0,0.4)",
    entrance: "fade",
  }),
  veedSimpleStyle("biz-03-medium-clean", "Medium Clean", "business", "karaoke-fill", {
    fontFamily: INTER,
    weight: 600,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 1px 5px rgba(0,0,0,0.4)",
    entrance: "fade",
  }),
  veedSimpleStyle("biz-04-bold-shadow", "Bold Shadow", "business", "karaoke-fill", {
    fontFamily: INTER,
    weight: 700,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 3px 10px rgba(0,0,0,0.5)",
    entrance: "fade",
  }),
  veedSimpleStyle("biz-05-professional-box", "Professional Box", "business", "box-highlight", {
    fontFamily: INTER,
    weight: 700,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    box: { color: "#222222", radius: "0.1em", paddingEm: "0.15em 0.3em" },
    entrance: "fade",
  }),
  veedSimpleStyle("biz-06-high-contrast", "High Contrast", "business", "karaoke-fill", {
    fontFamily: INTER_TIGHT,
    weight: 800,
    uppercase: true,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    strokeEm: 0.04,
    shadow: "0 4px 12px rgba(0,0,0,0.6)",
    entrance: "fade",
  }),
  veedSimpleStyle("biz-07-heavy-business", "Heavy Business", "business", "karaoke-fill", {
    fontFamily: INTER,
    weight: 800,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    strokeEm: 0.05,
    shadow: "0 3px 8px rgba(0,0,0,0.5)",
    entrance: "fade",
  }),

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  RETRO (6 styles)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  veedSimpleStyle("ret-01-yellow-italic", "Yellow Italic", "retro", "karaoke-fill", {
    fontFamily: INTER_TIGHT,
    weight: 800,
    italic: true,
    colorBase: "#FACC15",
    colorActive: "#FACC15",
    colorEmphasis: "#FACC15",
    strokeEm: 0.05,
    shadow: "3px 3px 0px rgba(0,0,0,0.8)",
    entrance: "fade",
  }),
  veedSimpleStyle("ret-02-classic-box", "Classic Box", "retro", "box-highlight", {
    fontFamily: INTER,
    weight: 800,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    box: { color: "#000000", radius: "0", paddingEm: "0.1em 0.3em" },
    entrance: "fade",
  }),
  veedSimpleStyle("ret-03-vintage-display", "Vintage Display", "retro", "karaoke-fill", {
    fontFamily: POPPINS,
    weight: 900,
    italic: true,
    colorBase: "#FACC15",
    colorActive: "#FACC15",
    colorEmphasis: "#FACC15",
    strokeEm: 0.06,
    shadow: "0 2px 5px rgba(0,0,0,0.6)",
    entrance: "fade",
  }),
  veedSimpleStyle("ret-04-subtitle-card", "Subtitle Card", "retro", "box-highlight", {
    fontFamily: INTER,
    weight: 500,
    italic: true,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    box: { color: "#000000", radius: "0", paddingEm: "0.1em 0.3em" },
    entrance: "fade",
  }),
  veedSimpleStyle("ret-05-olive-film", "Olive Film", "retro", "box-highlight", {
    fontFamily: INTER_TIGHT,
    weight: 800,
    colorBase: "#FACC15",
    colorActive: "#FACC15",
    colorEmphasis: "#FACC15",
    box: { color: "#000000", radius: "0", paddingEm: "0.1em 0.3em" },
    entrance: "fade",
  }),
  veedSimpleStyle("ret-06-cinematic", "Cinematic", "retro", "glow-shadow", {
    fontFamily: PLAYFAIR,
    weight: 800,
    italic: true,
    colorBase: "#FFFFFF",
    colorActive: "#FFFFFF",
    colorEmphasis: "#FFFFFF",
    shadow: "0 0 10px rgba(255,255,255,0.6), 0 2px 10px rgba(0,0,0,0.5)",
    entrance: "fade",
  }),
];
















