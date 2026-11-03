import { getDocumentProxy } from "unpdf";
import { AppError } from "../errors";
import { kanaKanjiCards } from "../llm/paired-lines";
import { isSectionHeading } from "../text/section-text";

const maxPdfPages = 50;
const sameLineDistance = 3;
const columnStartGap = 150;
const wrapGap = 22;

interface Glyph {
  x: number;
  y: number;
  end: number;
  size: number;
  text: string;
}

interface Cell {
  x: number;
  end: number;
  text: string;
}

interface Row {
  y: number;
  cells: Cell[];
}

interface VisualLine {
  x: number;
  y: number;
  size: number;
  text: string;
  heading: boolean;
}

export async function readPdfText(data: Uint8Array): Promise<string> {
  // PDF.js transfers the buffer to its worker, which detaches the caller's copy.
  const bytes = new Uint8Array(data);
  const pdf = await getDocumentProxy(bytes);
  try {
    if (pdf.numPages > maxPdfPages) {
      throw new AppError(
        "VALIDATION",
        `This PDF has ${pdf.numPages} pages. Use a PDF of ${maxPdfPages} pages or fewer.`,
        400,
      );
    }
    const columnPages: string[] = [];
    const paragraphPages: string[][] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const glyphs = content.items.flatMap((item) => {
        if (!("str" in item) || !item.str.trim()) return [];
        const x = item.transform[4] ?? 0;
        const y = item.transform[5] ?? 0;
        const width = "width" in item && typeof item.width === "number" ? item.width : 0;
        const height = "height" in item && typeof item.height === "number" ? item.height : 0;
        const scale = Math.abs(item.transform[3] ?? 0);
        return [{ x, y, end: x + width, size: height > 0 ? height : scale, text: item.str }];
      });
      const columnText = rowsToText(layoutRows(glyphs));
      if (columnText) columnPages.push(columnText);
      const paragraphs = paragraphsFromLines(lessonLines(visualLines(glyphs)));
      if (paragraphs.length > 0) paragraphPages.push(paragraphs);
    }
    const columns = columnPages.join("\n\n");
    if (kanaKanjiCards(columns)) return columns;
    return joinParagraphPages(paragraphPages);
  } finally {
    await pdf.destroy().catch(() => undefined);
  }
}

function layoutRows(glyphs: Glyph[]): Row[] {
  const ordered = [...glyphs].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Glyph[][] = [];
  for (const glyph of ordered) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].y - glyph.y) <= sameLineDistance) line.push(glyph);
    else lines.push([glyph]);
  }
  const rows: Row[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
    const row = { y: line[0].y, cells: cellsFromLine(line) };
    const previous = rows[rows.length - 1];
    if (previous && previous.y - row.y > 0 && previous.y - row.y <= wrapGap) {
      appendWrap(previous, row);
      continue;
    }
    rows.push(row);
  }
  return rows;
}

function cellsFromLine(line: Glyph[]): Cell[] {
  const cells: Cell[] = [];
  for (const glyph of line) {
    const last = cells[cells.length - 1];
    if (last && glyph.x - last.x <= columnStartGap) {
      last.text += glyph.text;
      last.end = Math.max(last.end, glyph.end);
      continue;
    }
    cells.push({ x: glyph.x, end: glyph.end, text: glyph.text });
  }
  return cells;
}

function appendWrap(previous: Row, row: Row): void {
  for (const cell of row.cells) {
    let nearest = previous.cells[0];
    let distance = Number.POSITIVE_INFINITY;
    for (const existing of previous.cells) {
      const gap = Math.abs(existing.x - cell.x);
      if (gap < distance) {
        distance = gap;
        nearest = existing;
      }
    }
    if (nearest && distance <= columnStartGap) {
      nearest.text += cell.text;
      nearest.end = Math.max(nearest.end, cell.end);
    } else {
      previous.cells.push({ ...cell });
    }
  }
  previous.cells.sort((a, b) => a.x - b.x);
}

function visualLines(glyphs: Glyph[]): VisualLine[] {
  const ordered = [...glyphs].sort((a, b) => b.y - a.y || a.x - b.x);
  const groups: Glyph[][] = [];
  for (const glyph of ordered) {
    const line = groups[groups.length - 1];
    if (line && Math.abs(line[0].y - glyph.y) <= sameLineDistance) line.push(glyph);
    else groups.push([glyph]);
  }
  return groups.flatMap((group) => {
    group.sort((a, b) => a.x - b.x);
    let text = "";
    let end = Number.NEGATIVE_INFINITY;
    let size = 0;
    for (const glyph of group) {
      if (text && glyph.x - end > 1.5) text += " ";
      text += glyph.text;
      end = Math.max(end, glyph.end);
      size = Math.max(size, glyph.size);
    }
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return [];
    return [{ x: group[0].x, y: group[0].y, size, text: cleaned, heading: false }];
  });
}

const imageBandGap = 48;

function lessonLines(lines: VisualLine[]): VisualLine[] {
  markFontHeadings(lines);
  for (const line of lines) {
    if (isSectionHeading(line.text)) line.heading = true;
  }
  const bands: VisualLine[][] = [];
  for (const line of lines) {
    const band = bands[bands.length - 1];
    const previous = band?.[band.length - 1];
    if (band && previous && previous.y - line.y <= imageBandGap) band.push(line);
    else bands.push([line]);
  }
  return bands.flatMap((band) => {
    const lesson = band.some((line) => line.heading || isProseLine(line.text));
    if (!lesson) return [];
    return band.filter((line) => line.heading || !isPageNoise(line.text));
  });
}

function markFontHeadings(lines: VisualLine[]): void {
  const samples = lines.filter((line) => line.text.length >= 40 && line.size > 0).map((line) => line.size);
  const pool = samples.length > 0 ? samples : lines.map((line) => line.size).filter((size) => size > 0);
  if (pool.length === 0) return;
  const sorted = [...pool].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  if (median <= 0) return;
  for (const line of lines) {
    if (line.size >= median * 1.25 && line.text.length <= 80 && !/[.!?。？！]$/.test(line.text)) {
      line.heading = true;
    }
  }
}

function isProseLine(text: string): boolean {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter((word) => /[A-Za-z\u4e00-\u9fff]{2,}/.test(word));
  if (trimmed.length >= 80 || words.length >= 5) return true;
  return words.length >= 2 && /[.!?。？！]$/.test(trimmed);
}

function isPageNoise(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return trimmed.length <= 4 && !/[A-Za-z\u4e00-\u9fff]{3,}/.test(trimmed);
}

function paragraphsFromLines(lines: VisualLine[]): string[] {
  const paragraphs: string[] = [];
  let current = "";
  let previous: VisualLine | null = null;
  for (const line of lines) {
    const bullet = /^[●•▪◦]/.test(line.text);
    const gap = previous ? previous.y - line.y : Number.POSITIVE_INFINITY;
    const previousLong = (previous?.text.length ?? 0) > 60;
    const indented = previous ? line.x > previous.x + 16 : false;
    const unfinished = previous ? !/[.!?。？！]$/.test(previous.text) : false;
    const headingBreak = line.heading || previous?.heading === true;
    const join =
      previous !== null &&
      !bullet &&
      !headingBreak &&
      gap > 0 &&
      ((gap <= 17 && (indented || previousLong)) ||
        (gap <= 22 && indented) ||
        (gap <= 22 && previousLong && unfinished && line.x <= previous.x + 5));
    if (join) current = joinLines(current, line.text);
    else {
      if (current) paragraphs.push(current);
      current = line.text;
    }
    previous = line;
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

function joinLines(current: string, next: string): string {
  const glue = current.endsWith("-") ? "" : " ";
  return `${current}${glue}${next}`.replace(/\s+/g, " ").trim();
}

function joinParagraphPages(pages: string[][]): string {
  const paragraphs: string[] = [];
  for (const page of pages) {
    if (page.length === 0) continue;
    const last = paragraphs[paragraphs.length - 1];
    const next = page[0] ?? "";
    if (last && !/[.!?。？！]$/.test(last) && !isSectionHeading(last) && !isSectionHeading(next)) {
      paragraphs[paragraphs.length - 1] = joinLines(last, page[0]);
      paragraphs.push(...page.slice(1));
    } else {
      paragraphs.push(...page);
    }
  }
  return paragraphs.join("\n\n");
}

function rowsToText(rows: Row[]): string {
  return rows
    .map((row) =>
      row.cells
        .map((cell) => cell.text.replace(/\s+/g, " ").trim())
        .filter((cell) => cell.length > 0)
        .join("\t"),
    )
    .filter((line) => line.length > 0)
    .join("\n");
}
