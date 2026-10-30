import { maxUploadBytes } from "@rev/shared";
import { AppError } from "../errors";

const maxBase64Chars = 8_200_000;

export function decodeUpload(value: string, label: string): Uint8Array {
  const compact = value.trim().replace(/^data:[^,]*,/, "").replace(/\s/g, "");
  if (!compact || compact.length > maxBase64Chars) {
    throw new AppError("VALIDATION", `${label} must be 6 MB or smaller.`, 400);
  }
  const padding = compact.match(/=+$/)?.[0].length ?? 0;
  const body = compact.slice(0, compact.length - padding);
  if (padding > 2 || body.length % 4 === 1 || /[^A-Za-z0-9+/]/.test(body)) {
    throw new AppError("VALIDATION", `${label} data must be base64.`, 400);
  }
  const padded = body + "=".repeat((4 - (body.length % 4)) % 4);
  const bytes = Buffer.from(padded, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > maxUploadBytes) {
    throw new AppError("VALIDATION", `${label} must be 6 MB or smaller.`, 400);
  }
  return new Uint8Array(bytes);
}
