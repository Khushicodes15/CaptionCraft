/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { CaptionedVideo } from "./CaptionedVideo";
import type { CaptionStyle, CaptionPosition } from "../../modules/styles/types";

vi.mock("remotion", () => {
  return {
    useCurrentFrame: () => 30,
    useVideoConfig: () => ({ fps: 30, width: 1080, height: 1920 }),
    AbsoluteFill: ({ children }: any) => <div>{children}</div>,
    Video: () => <video />,
    interpolate: (_v: number, _i: number[], o: number[]) => o[1] ?? 1,
    spring: () => 1,
  };
});

describe("CaptionedVideo component rendering", () => {
  const captions = [
    { text: "Education", startMs: 0, endMs: 500, timestampMs: 0, confidence: 1 },
    { text: "is", startMs: 500, endMs: 1000, timestampMs: 500, confidence: 1 },
    { text: "the", startMs: 1000, endMs: 1500, timestampMs: 1000, confidence: 1 },
    { text: "key", startMs: 1500, endMs: 2000, timestampMs: 1500, confidence: 1 },
  ];

  const position: CaptionPosition = { xPercent: 50, yPercent: 50, widthPercent: 80 };

  const baseStyle: CaptionStyle = {
    id: "test-stacked",
    name: "Test Stacked",
    category: "business",
    engine: "editorial-stack",
    tokens: {
      fontFamily: "Arial",
      weight: 400,
      colorBase: "#fff",
      colorActive: "#fff",
      colorEmphasis: "red",
      entrance: "fade",
    },
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
    },
  };

  it("renders stacked layout in correct visual DOM order", () => {
    const emphasis = { "1": 3 as const };

    const { container } = render(
      <CaptionedVideo
        videoSrc={null}
        captions={captions}
        emphasis={emphasis}
        style={baseStyle}
        position={position}
        wordsPerLine={4}
      />,
    );

    const spans = Array.from(container.querySelectorAll("span"));
    const textContent = spans.map((span) => span.textContent);
    expect(textContent).toEqual(["Education", "is", "the", "key"]);
  });

  it("renders inline layout in correct visual DOM order", () => {
    const inlineStyle: CaptionStyle = { ...baseStyle, engine: "karaoke-fill" };
    const emphasis = { "1": 3 as const };

    const { container } = render(
      <CaptionedVideo
        videoSrc={null}
        captions={captions}
        emphasis={emphasis}
        style={inlineStyle}
        position={position}
        wordsPerLine={4}
      />,
    );

    const spans = Array.from(container.querySelectorAll("span"));
    const textContent = spans.map((span) => span.textContent);
    expect(textContent).toEqual(["Education", "is", "the", "key"]);
  });
});
