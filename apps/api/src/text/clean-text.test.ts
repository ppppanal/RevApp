import { describe, expect, it } from "vitest";
import { cleanNoteText, deriveTitle } from "./clean-text";

describe("cleanNoteText", () => {
  it("normalizes whitespace and drops control characters", () => {
    const cleaned = cleanNoteText("Mitochondria   produce ATP.\r\n\r\n\r\nATP \u0000is\u00a0energy.  ");
    expect(cleaned).toBe("Mitochondria produce ATP.\n\nATP is energy.");
  });

  it("returns an empty string when nothing readable remains", () => {
    expect(cleanNoteText("\u0000\u0001\n\n  ")).toBe("");
  });
});

describe("deriveTitle", () => {
  it("uses the first line and shortens a long one", () => {
    expect(deriveTitle("Cells\n\nMore")).toBe("Cells");
    expect(deriveTitle(`${"a".repeat(90)}`)).toBe(`${"a".repeat(77)}...`);
  });
});
