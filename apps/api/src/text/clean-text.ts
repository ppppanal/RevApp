export function stripNullBytes(input: string): string {
  return input.replace(/\u0000/g, "");
}

export function cleanNoteText(input: string): string {
  const withoutControls = input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\u00a0/g, " ");
  const normalizedNewlines = withoutControls.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalizedNewlines.split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim());
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function deriveTitle(text: string): string {
  const line = text.split("\n").find((part) => part.trim().length > 0) ?? "Untitled note";
  const trimmed = line.trim();
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 77)}...`;
}
