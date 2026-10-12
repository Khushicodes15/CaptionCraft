import { describe, it, expect } from "vitest";
import { getStackedLines, getEffectiveEmphasis } from "./layout";

describe("Caption Layout Algorithm", () => {
  const makeToken = (text: string, index: number) => ({
    text,
    index,
    fromMs: index * 1000,
    toMs: index * 1000 + 500,
  });

  describe("getStackedLines", () => {
    it("renders as a single line when there is no emphasis", () => {
      const tokens = [makeToken("Hello", 0), makeToken("world", 1)];
      const emphasis = {};

      const lines = getStackedLines(tokens, emphasis);
      expect(lines[0]!.map((t) => t.text).join(" ")).toBe("Hello world");
    });

    it("puts tokens before on line 1, emphasis on line 2, and after on line 3", () => {
      const tokens = [
        makeToken("Education", 0),
        makeToken("is", 1),
        makeToken("the", 2),
        makeToken("key", 3),
      ];
      // Emphasize "is"
      const emphasis = { "1": 1 as const };

      const lines = getStackedLines(tokens, emphasis);
      expect(lines.length).toBe(3);
      expect(lines[0]!.map((t) => t.text).join(" ")).toBe("Education");
      expect(lines[1]!.map((t) => t.text).join(" ")).toBe("is");
      expect(lines[2]!.map((t) => t.text).join(" ")).toBe("the key");

      // Flattened reading order must match original
      const flattened = lines.flat().map((t) => t.text);
      expect(flattened).toEqual(["Education", "is", "the", "key"]);
    });

    it("omits the top line if the emphasized word is first", () => {
      const tokens = [makeToken("Education", 0), makeToken("is", 1), makeToken("the", 2)];
      // Emphasize "Education"
      const emphasis = { "0": 2 as const };

      const lines = getStackedLines(tokens, emphasis);
      expect(lines.length).toBe(2);
      expect(lines[0]!.map((t) => t.text).join(" ")).toBe("Education");
      expect(lines[1]!.map((t) => t.text).join(" ")).toBe("is the");

      const flattened = lines.flat().map((t) => t.text);
      expect(flattened).toEqual(["Education", "is", "the"]);
    });

    it("omits the bottom line if the emphasized word is last", () => {
      const tokens = [makeToken("This", 0), makeToken("is", 1), makeToken("GREAT", 2)];
      // Emphasize "GREAT"
      const emphasis = { "2": 3 as const };

      const lines = getStackedLines(tokens, emphasis);
      expect(lines.length).toBe(2);
      expect(lines[0]!.map((t) => t.text).join(" ")).toBe("This is");
      expect(lines[1]!.map((t) => t.text).join(" ")).toBe("GREAT");

      const flattened = lines.flat().map((t) => t.text);
      expect(flattened).toEqual(["This", "is", "GREAT"]);
    });

    it("keeps highest level emphasis and renders others as base words on ties", () => {
      const tokens = [
        makeToken("Wait", 0),
        makeToken("this", 1),
        makeToken("is", 2),
        makeToken("HUGE", 3),
      ];
      // Multiple emphasis marks
      const emphasis = {
        "0": 1 as const,
        "2": 1 as const,
        "3": 3 as const, // Highest level wins
      };

      const lines = getStackedLines(tokens, emphasis);
      expect(lines.length).toBe(2);
      expect(lines[0]!.map((t) => t.text).join(" ")).toBe("Wait this is");
      expect(lines[1]!.map((t) => t.text).join(" ")).toBe("HUGE");

      // Effective emphasis should only be active for the chosen word
      expect(getEffectiveEmphasis(0, tokens, emphasis)).toBe(0);
      expect(getEffectiveEmphasis(1, tokens, emphasis)).toBe(0);
      expect(getEffectiveEmphasis(2, tokens, emphasis)).toBe(0);
      expect(getEffectiveEmphasis(3, tokens, emphasis)).toBe(3);
    });

    it("on level ties, keeps the earliest word as emphasized", () => {
      const tokens = [makeToken("FIRST", 0), makeToken("and", 1), makeToken("SECOND", 2)];
      // Ties in level
      const emphasis = {
        "0": 2 as const,
        "2": 2 as const,
      };

      const lines = getStackedLines(tokens, emphasis);
      expect(lines.length).toBe(2);
      // FIRST wins because it's earlier.
      expect(lines[0]!.map((t) => t.text).join(" ")).toBe("FIRST");
      expect(lines[1]!.map((t) => t.text).join(" ")).toBe("and SECOND");

      expect(getEffectiveEmphasis(0, tokens, emphasis)).toBe(2);
      expect(getEffectiveEmphasis(2, tokens, emphasis)).toBe(0);
    });
  });
});
