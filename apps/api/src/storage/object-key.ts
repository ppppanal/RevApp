const imageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"]);

export function sourceObjectKey(input: {
  userId: string;
  sourceId: string;
  filename?: string;
  kind: "pdf" | "image";
}): string {
  const fallback = input.kind === "pdf" ? "upload.pdf" : "upload";
  return `users/${input.userId}/sources/${input.sourceId}/${safeFilename(input.filename) ?? fallback}`;
}

export function imageContentType(mimeType: string | undefined): string {
  const mime = mimeType?.trim().toLowerCase();
  if (mime === "image/jpg") return "image/jpeg";
  if (mime && imageTypes.has(mime)) return mime;
  return "application/octet-stream";
}

function safeFilename(filename: string | undefined): string | null {
  const base = filename?.split(/[/\\]/).pop()?.trim() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").replace(/_+/g, "_");
  if (!cleaned || cleaned === "_" || cleaned === ".") return null;
  return cleaned.slice(0, 120);
}
