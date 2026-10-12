import type { CaptionPage } from "@/modules/remotion/CaptionedVideo";
import type { EmphasisMap } from "@/modules/styles/types";

type Token = CaptionPage["tokens"][number];

/**
 * Stacked layout algorithm:
 * - Allows at most ONE emphasized word per page.
 * - If several are marked, keep the highest level (earliest on ties) and render the others as base words.
 * - Split the page's tokens at the chosen emphasized word:
 *   - Tokens BEFORE it go on the line above (line 1)
 *   - The emphasized word gets its own line (line 2)
 *   - Tokens AFTER it go on the line below (line 3)
 * - If the emphasized word is first or last, that line is omitted.
 * - If a page has no emphasized word, render it as one normal line.
 *
 * Returns an array of lines, where each line is an array of tokens.
 */
export function getStackedLines(tokens: Token[], emphasis: EmphasisMap): Token[][] {
  if (tokens.length === 0) return [];

  // Find the single emphasized word to use
  let bestTokenIndex = -1;
  let highestLevel = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const level = emphasis[String(token.index)] ?? 0;
    if (level > highestLevel) {
      highestLevel = level;
      bestTokenIndex = i;
    }
  }

  // If no emphasis, or level is 0, return a single line
  if (bestTokenIndex === -1 || highestLevel === 0) {
    return [tokens];
  }

  const before = tokens.slice(0, bestTokenIndex);
  const emphasisToken = tokens[bestTokenIndex]!;
  const after = tokens.slice(bestTokenIndex + 1);

  const lines: Token[][] = [];
  if (before.length > 0) lines.push(before);
  lines.push([emphasisToken]);
  if (after.length > 0) lines.push(after);

  return lines;
}

/**
 * Returns the effective emphasis level for a token in a stacked layout.
 * Ensures that only the chosen token gets emphasis, and others get 0.
 */
export function getEffectiveEmphasis(
  tokenIndex: number,
  tokens: Token[],
  emphasis: EmphasisMap,
): number {
  let bestTokenGlobalIndex = -1;
  let highestLevel = 0;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const level = emphasis[String(t.index)] ?? 0;
    // Tie-breaker: earliest (since we only update if level > highestLevel)
    if (level > highestLevel) {
      highestLevel = level;
      bestTokenGlobalIndex = t.index;
    }
  }

  if (tokenIndex === bestTokenGlobalIndex) {
    return highestLevel;
  }
  return 0;
}
