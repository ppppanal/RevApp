import { describe, expect, it } from "vitest";
import { imageContentType, sourceObjectKey } from "./object-key";

describe("sourceObjectKey", () => {
  it("keeps a safe filename and drops path segments", () => {
    expect(
      sourceObjectKey({ userId: "user_1", sourceId: "src_1", filename: "notes.pdf", kind: "pdf" }),
    ).toBe("users/user_1/sources/src_1/notes.pdf");
    expect(
      sourceObjectKey({ userId: "user_1", sourceId: "src_1", filename: "../secret.pdf", kind: "pdf" }),
    ).toBe("users/user_1/sources/src_1/secret.pdf");
    expect(sourceObjectKey({ userId: "user_1", sourceId: "src_1", filename: "   ", kind: "image" })).toBe(
      "users/user_1/sources/src_1/upload",
    );
  });
});

describe("imageContentType", () => {
  it("accepts the image types OCR can read", () => {
    expect(imageContentType("image/jpg")).toBe("image/jpeg");
    expect(imageContentType("image/png")).toBe("image/png");
    expect(imageContentType("text/plain")).toBe("application/octet-stream");
  });
});
