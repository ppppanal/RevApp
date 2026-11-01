import { describe, expect, it } from "vitest";
import { quoteIsInSource } from "./quote";
import { normalizeTagNames } from "./tags";

describe("quotes", () => {
  it("matches a passage from the source when whitespace differs", () => {
    expect(quoteIsInSource("produce   ATP", ["Mitochondria produce ATP.\nATP is energy."])).toBe(true);
    expect(quoteIsInSource("the nucleus", ["Mitochondria produce ATP."])).toBe(false);
    expect(quoteIsInSource("A", ["A long note"])).toBe(false);
  });
});

describe("tags", () => {
  it("trims and dedupes tag names", () => {
    expect(normalizeTagNames([" ATP ", "atp", "cells"])).toEqual(["ATP", "cells"]);
  });
});
