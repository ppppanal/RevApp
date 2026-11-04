import { AppError } from "../errors";

export function normalizeTagNames(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of values ?? []) {
    const name = value.trim().replace(/\s+/g, " ");
    if (!name) continue;
    if (name.length > 40) {
      throw new AppError("VALIDATION", "Tags must be 40 characters or shorter.", 400);
    }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length > 12) {
      throw new AppError("VALIDATION", "Use 12 tags or fewer.", 400);
    }
  }
  return names;
}
