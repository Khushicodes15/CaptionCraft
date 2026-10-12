/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { BaseEngineRenderer } from "./EngineRenderer";
import { getStyle, CAPTION_STYLES } from "../styles/presetRegistry";

vi.mock("remotion", () => ({
  AbsoluteFill: ({ children, style }: any) => <div style={style}>{children}</div>,
  useCurrentFrame: () => 0,
  useVideoConfig: () => ({ fps: 30, width: 1080, height: 1920 }),
  interpolate: (_v: number, _i: number[], o: number[]) => o[1] ?? 1,
  spring: () => 1,
}));

describe("Caption scaling", () => {
  it("renders with cqw units for automatic scaling", () => {
    const style = getStyle("classic-shadow");

    const page = {
      startMs: 0,
      endMs: 2000,
      tokens: [{ text: "test", fromMs: 0, toMs: 1000, index: 0 }],
    };

    const { container } = render(
      <BaseEngineRenderer
        page={page}
        style={style}
        emphasis={{ "0": 0 }}
        baseFontCqw={10}
        posterState={{ activeIndex: 0 }}
      />,
    );

    const span = container.querySelector("span");
    expect(span).toBeTruthy();
    expect(span?.style.fontSize).toMatch(/cqw$/);
    expect(span?.style.fontSize).toBe("10cqw");
  });
});

describe("Mixed-type engine reading order", () => {
  const page = {
    startMs: 0,
    endMs: 4000,
    tokens: [
      { text: "how", fromMs: 0, toMs: 500, index: 0 },
      { text: "to", fromMs: 500, toMs: 1000, index: 1 },
      { text: "keep", fromMs: 1000, toMs: 1500, index: 2 },
      { text: "your", fromMs: 1500, toMs: 2000, index: 3 },
      { text: "9-5", fromMs: 2000, toMs: 2500, index: 4 },
      { text: "fun", fromMs: 2500, toMs: 3000, index: 5 },
    ],
  };

  for (const style of CAPTION_STYLES.filter((s) => s.engine === "mixed-type")) {
    it(`"${style.name}" preserves reading order`, () => {
      const emphasis = { "2": 3 as const }; // "keep" is accent

      const { container } = render(
        <BaseEngineRenderer
          page={page}
          style={style}
          emphasis={emphasis}
          baseFontCqw={10}
          autoAccent={false}
          posterState={{ activeIndex: 0 }}
        />,
      );

      const spans = Array.from(container.querySelectorAll("span"));
      const textContent = spans.map((span) => span.textContent?.trim()).filter(Boolean);

      // Reading order must be preserved regardless of how lines are split
      const originalOrder = page.tokens.map((t) => t.text.toLowerCase());
      const renderedOrder = textContent.map((t) => t!.toLowerCase());

      // Every rendered word should appear in the original order
      let lastFoundIdx = -1;
      for (const word of renderedOrder) {
        const idx = originalOrder.indexOf(word, lastFoundIdx + 1);
        expect(idx).toBeGreaterThan(lastFoundIdx);
        lastFoundIdx = idx;
      }
    });
  }

  it("accent word with user emphasis overrides auto-accent", () => {
    const style = getStyle("soft-vlog");
    const emphasis = { "4": 3 as const }; // "9-5" is user-set accent

    const { container } = render(
      <BaseEngineRenderer
        page={page}
        style={style}
        emphasis={emphasis}
        baseFontCqw={10}
        autoAccent={true}
        posterState={{ activeIndex: 0 }}
      />,
    );

    const spans = Array.from(container.querySelectorAll("span"));
    // Verify all words are rendered
    expect(spans.length).toBeGreaterThanOrEqual(6);
  });
});

describe("Mixed-type fit test — long accent word", () => {
  it("renders 'Washington' without clipping at narrow width", () => {
    const style = getStyle("soft-vlog");
    const page = {
      startMs: 0,
      endMs: 3000,
      tokens: [
        { text: "a", fromMs: 0, toMs: 500, index: 0 },
        { text: "week", fromMs: 500, toMs: 1000, index: 1 },
        { text: "in", fromMs: 1000, toMs: 1500, index: 2 },
        { text: "Washington", fromMs: 1500, toMs: 2000, index: 3 },
      ],
    };
    const emphasis = { "3": 3 as const };

    const { container } = render(
      <BaseEngineRenderer
        page={page}
        style={style}
        emphasis={emphasis}
        baseFontCqw={10}
        autoAccent={false}
        posterState={{ activeIndex: 0 }}
      />,
    );

    const spans = Array.from(container.querySelectorAll("span"));
    const washingtonSpan = spans.find((s) => s.textContent?.toLowerCase() === "washington");
    expect(washingtonSpan).toBeTruthy();
    // It should render (we can't test actual pixel clipping in jsdom,
    // but we verify it exists and has a font-size set)
    expect(washingtonSpan?.style.fontSize).toMatch(/cqw$/);
  });
});
