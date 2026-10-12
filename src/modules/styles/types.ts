import { z } from "zod";

export const captionSchema = z
  .object({
    id: z.string().optional(),
    text: z.string(),
    startMs: z.number().catch(0),
    endMs: z.number().catch(0),
    timestampMs: z.number().nullish(),
    confidence: z.number().nullish(),
    words: z.array(z.object({
      text: z.string(),
      startMs: z.number(),
      endMs: z.number(),
    })).optional(),
    styleOverrides: z.any().optional(),
  })
  .passthrough();
export type Caption = z.infer<typeof captionSchema>;

export const captionsSchema = z.array(captionSchema);

/** captionIndex -> emphasis level */
export const emphasisSchema = z.record(
  z.string(),
  z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
);
export type EmphasisMap = z.infer<typeof emphasisSchema>;

// â”€â”€ Engine types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type EngineType =
  | "karaoke-fill"
  | "box-highlight"
  | "outline-pop"
  | "kinetic-slam"
  | "editorial-stack"
  | "glow-shadow"
  | "mixed-type";

export type StyleCategory =
  "aesthetic" | "social" | "business" | "retro" | "dynamic" | "content-aware";

// â”€â”€ Mixed-type tokens (typographic collage) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type TextCase = "lower" | "upper" | "sentence" | "title";

export type MixedTypeBaseTokens = {
  fontFamily: string;
  weight: number;
  italic?: boolean;
  case: TextCase;
  sizeEm: number; // relative base size, usually 1
  tracking?: string; // e.g. "0.02em"
  color: string;
  colorActive?: string; // Color when word is spoken
  colorPast?: string; // Color when word has already been spoken
};

export type MixedTypeAccentTokens = {
  fontFamily: string;
  weight: number;
  italic?: boolean;
  case: TextCase;
  sizeEm: number; // 1.6â€“2.6 relative to base
  tracking?: string;
  color: string;
  colorActive?: string;
  colorPast?: string;
  rotateDeg?: number;
  scaleX?: number;
};

export type PillStyle = {
  color: string;
  radius: string;
  paddingEm: string;
  applyTo: "base" | "accent" | "all";
  /** Color for accent-word pill (overrides `color` for accent words) */
  colorAccent?: string;
  /** Cream/off-white color for base-word pill when applyTo=="accent" */
  colorBase?: string;
  /** Active/spoken-word pill color override */
  colorActive?: string;
  /** CSS box-shadow for the pill container */
  boxShadow?: string;
};

export type MixedTypeTokens = {
  base: MixedTypeBaseTokens;
  accent: MixedTypeAccentTokens;
  layout: "stack-left" | "stack-center" | "inline";
  lineBreakMode?: "auto" | "every-word" | "accent-isolated" | "news-blocks";
  layering?: "normal" | "hero-overlap" | "playful-scatter";
  writingMode?: "vertical-rl";
  lineBox?: {
    colorBase: string;
    colorAccent?: string;
    paddingEm: string;
    radius?: string;
  };
  leading: number; // line-height, 0.85â€“1.1
  accentOverlapEm: number; // negative margin, e.g. -0.25
  pill?: PillStyle;
  shadow: string;
  outline?: string; // e.g. "0.07em #FFFFFF"
  entrance: "rise" | "fade" | "pop" | "write";
};

// â”€â”€ Legacy style tokens (for classic styles) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type StyleTokens = {
  fontFamily: string;
  fontFamilyEmphasis?: string;
  weight: number;
  weightEmphasis?: number;
  italic?: boolean;
  uppercase?: boolean;
  colorBase: string;
  colorActive: string;
  colorEmphasis: string;
  box?: {
    color: string;
    radius?: string;
    paddingEm?: string;
  };
  strokeEm?: number;
  shadow?: string;
  entrance: "fade" | "pop" | "rise";
};

// â”€â”€ Capability Flags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type CaptionStyleCapabilities = {
  supportsFontOverride: boolean;
  supportsWeightOverride: boolean;
  supportsColorOverride: boolean;
  supportsEmphasis: boolean;
  supportsActiveWord: boolean;
  supportsBackground: boolean;
  supportsOutline: boolean;
  supportsShadow: boolean;
  supportsAnimation: boolean;
  supportsWholeCaptionAnimation?: boolean;
  supportsWordAnimation?: boolean;
};

// â”€â”€ Caption style (supports both legacy and mixed-type) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type CaptionStyle = {
  id: string;
  name: string;
  category: StyleCategory;
  engine: EngineType;
  tokens: StyleTokens; // always present (legacy engines use this)
  mixedTokens?: MixedTypeTokens; // only for engine: "mixed-type"
  capabilities: CaptionStyleCapabilities;
};

// â”€â”€ Position & project state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const positionSchema = z.object({
  xPercent: z.number(),
  yPercent: z.number(),
  widthPercent: z.number(),
  heightPercent: z.number().optional(),
  isManualSizing: z.boolean().optional(),
  rotateDeg: z.number().optional(),
  sizeMultiplier: z.number().optional(),
  lineSpacing: z.number().optional(),
});
export type CaptionPosition = z.infer<typeof positionSchema>;

export const DEFAULT_POSITION: CaptionPosition = { xPercent: 50, yPercent: 78, widthPercent: 80 };

export const spokenWordSchema = z.object({
  enabled: z.boolean(),
  color: z.string().optional(),
  colorOnCatchy: z.string().optional(),
  box: z.boolean().optional(),
});

export const projectStyleStateSchema = z.object({
  styleId: z.string(),
  wordsPerLine: z.number().min(1).max(8),
  linesPerCaption: z.number().min(1).max(3).optional(),
  position: positionSchema,
  fontFamilyOverride: z.string().optional(),
  fontFamilyEmphasisOverride: z.string().optional(),
  autoAccent: z.boolean().optional(),
  // Text overrides
  align: z.enum(["left", "center", "right"]).optional(),
  letterSpacing: z.number().optional(),
  wordSpacing: z.number().optional(),
  lineSpacing: z.number().optional(),
  // Normal words
  normalFont: z.string().optional(),
  normalWeight: z.number().optional(),
  normalColor: z.string().optional(),
  normalBackground: z.boolean().optional(),
  normalSizeMultiplier: z.number().optional(),
  // Catchy words
  catchyFont: z.string().optional(),
  catchyWeight: z.number().optional(),
  catchyColor: z.string().optional(),
  catchySizeMultiplier: z.number().optional(),
  // Spoken word highlight
  spokenWord: spokenWordSchema.optional(),
  // Animation
  animation: z.enum(["none", "rise", "fade", "pop", "typewriter", "write"]).optional(),
  animationScope: z.enum(["caption", "word"]).optional(),
  // Scope for edits
  scope: z.enum(["this", "all"]).optional(),
  // Effect options
  behindHead: z.boolean().optional(),
  // Undo/redo snapshots
  undoStack: z.array(z.any()).optional(),
  redoStack: z.array(z.any()).optional(),
});
export type ProjectStyleState = z.infer<typeof projectStyleStateSchema>;

export const DEFAULT_STYLE_STATE: ProjectStyleState = {
  styleId: "soft-vlog",
  wordsPerLine: 4,
  linesPerCaption: 2,
  position: DEFAULT_POSITION,
  autoAccent: true,
  align: "center",
  spokenWord: { enabled: true },
  animation: "fade",
  scope: "all",
  behindHead: false,
};







