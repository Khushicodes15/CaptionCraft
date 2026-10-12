import { describe, it, expect } from "vitest";

function shouldAutosave(currentCaptions: any[], dbCaptions: any, hasLoadError: boolean): boolean {
  if (hasLoadError) return false;
  if (currentCaptions.length === 0 && Array.isArray(dbCaptions) && dbCaptions.length > 0) {
    return false;
  }
  return true;
}

describe("Autosave Guard Logic", () => {
  it("allows autosave when there are no errors and captions are present", () => {
    expect(shouldAutosave([{ text: "hello" }], [{ text: "hello" }], false)).toBe(true);
  });

  it("blocks autosave if there was a load error", () => {
    expect(shouldAutosave([{ text: "hello" }], [{ text: "hello" }], true)).toBe(false);
  });

  it("blocks autosave if current captions are empty but DB captions had data", () => {
    expect(shouldAutosave([], [{ text: "previous data" }], false)).toBe(false);
  });

  it("allows autosave of empty captions if DB captions were also empty", () => {
    expect(shouldAutosave([], [], false)).toBe(true);
    expect(shouldAutosave([], null, false)).toBe(true);
  });
});
