import { describe, expect, it } from "vitest";
import { AppError } from "../errors";
import { localRevisionPack, NO_PAIRED_LINES_MESSAGE, splitPairedLine } from "./paired-lines";

describe("paired lines", () => {
  it("splits a line on a tab, several spaces, a pipe, or a colon", () => {
    expect(splitPairedLine("ATP\tenergy currency")).toEqual({ term: "ATP", meaning: "energy currency" });
    expect(splitPairedLine("Cell    basic unit")).toEqual({ term: "Cell", meaning: "basic unit" });
    expect(splitPairedLine("Gene | a unit of heredity")).toEqual({
      term: "Gene",
      meaning: "a unit of heredity",
    });
    expect(splitPairedLine("Mitochondria: powerhouse")).toEqual({
      term: "Mitochondria",
      meaning: "powerhouse",
    });
  });

  it("skips lines that do not split into one term and one meaning", () => {
    expect(splitPairedLine("just a sentence")).toBeNull();
    expect(splitPairedLine("one space only")).toBeNull();
    expect(splitPairedLine("too\tmany\tcolumns")).toBeNull();
    expect(splitPairedLine("Term: meaning: extra")).toBeNull();
    expect(splitPairedLine("   ")).toBeNull();
  });

  it("builds one card per paired line and rejects a file with none", () => {
    const pack = localRevisionPack("ATP\tenergy currency\njust a sentence\nCell: basic unit\n");
    expect(pack.flashcards).toEqual([
      { question: "ATP", answer: "energy currency" },
      { question: "Cell", answer: "basic unit" },
    ]);
    expect(() => localRevisionPack("no pairs here")).toThrow(AppError);
    expect(() => localRevisionPack("no pairs here")).toThrow(NO_PAIRED_LINES_MESSAGE);
  });
});
