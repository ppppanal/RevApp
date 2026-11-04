import { describe, expect, it } from "vitest";
import { parseLoginIdentifier } from "./login-identifier";
import { assertPassword, hashPassword, verifyPassword } from "./password";

describe("passwords", () => {
  it("stores a hash that verifies only the same password", async () => {
    assertPassword("correct-horse");
    const stored = await hashPassword("correct-horse");
    expect(stored).not.toContain("correct-horse");
    expect(await verifyPassword("correct-horse", stored)).toBe(true);
    expect(await verifyPassword("other-horse", stored)).toBe(false);
    expect(await verifyPassword("correct-horse", "not-a-hash")).toBe(false);
  });

  it("rejects a short password", () => {
    expect(() => assertPassword("short")).toThrow(/at least 8/);
  });
});

describe("login identifiers", () => {
  it("accepts an email or a username", () => {
    expect(parseLoginIdentifier("Ada@Example.com")).toEqual({ email: "ada@example.com", username: null });
    expect(parseLoginIdentifier("Ada_1")).toEqual({ email: null, username: "ada_1" });
  });

  it("rejects a login that is neither", () => {
    expect(() => parseLoginIdentifier("a")).toThrow(/username/);
    expect(() => parseLoginIdentifier("not-an-email@")).toThrow(/username/);
  });
});
