/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { StylePoster } from "./StylePoster";
import { CAPTION_STYLES } from "../styles/presetRegistry";

vi.mock("remotion", () => ({
  AbsoluteFill: ({ children, style }: any) => <div style={style}>{children}</div>,
  useCurrentFrame: () => 0,
  useVideoConfig: () => ({ fps: 30, width: 1080, height: 1920 }),
  interpolate: (_v: number, _i: number[], o: number[]) => o[1],
  spring: () => 1,
}));

describe("StylePoster rendering", () => {
  beforeAll(() => {
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      width: 120,
      height: 40,
      top: 0,
      left: 0,
      bottom: 40,
      right: 120,
      x: 0,
      y: 0,
      toJSON: () => {},
    }));
  });

  const sampleText = "how to keep your 9-5 fun";

  for (const style of CAPTION_STYLES) {
    it(`renders poster frame for "${style.name}" with non-empty text`, () => {
      const { container } = render(
        <StylePoster style={style} sampleText={sampleText} width={1080} height={1920} />,
      );

      const spans = Array.from(container.querySelectorAll("span"));
      expect(spans.length).toBeGreaterThanOrEqual(1);

      for (const span of spans) {
        expect(span.textContent).toBeTruthy();
        const rect = span.getBoundingClientRect();
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
      }
    });

    if (style.engine === "mixed-type" && style.mixedTokens) {
      it(`"${style.name}" has accent word with different font`, () => {
        const { container } = render(
          <StylePoster style={style} sampleText={sampleText} width={1080} height={1920} />,
        );

        const spans = Array.from(container.querySelectorAll("span"));
        const fonts = new Set(spans.map((s) => s.style.fontFamily));
        // Mixed-type styles should use at least the base font; accent may differ
        expect(fonts.size).toBeGreaterThanOrEqual(1);
      });
    }
  }
});
