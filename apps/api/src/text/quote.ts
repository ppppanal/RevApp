export function quoteIsInSource(quote: string, sources: Array<string | null | undefined>): boolean {
  const needle = collapse(quote);
  if (needle.length < 3) return false;
  return sources.some((source) => collapse(source ?? "").includes(needle));
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
