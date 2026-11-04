import { describe, expect, it } from "vitest";
import { shouldTryKatakanaChart } from "./katakana-chart";

describe("katakana chart detection", () => {
  it("retries a chart whose page read dropped the characters", () => {
    const dropped = "Ta Ai Ju Te Fo\nHa Fu Tw Hk dk\nPsa Ushi Asu Ese Vso\nHta Fi Visu Tt Pt";
    expect(shouldTryKatakanaChart(dropped)).toBe(true);
    expect(shouldTryKatakanaChart("ア a イ i ウ u エ e オ o")).toBe(true);
  });

  it("leaves an English note on the normal image read", () => {
    expect(shouldTryKatakanaChart("Mitochondria produce ATP")).toBe(false);
    expect(shouldTryKatakanaChart("ATP")).toBe(false);
  });
});
