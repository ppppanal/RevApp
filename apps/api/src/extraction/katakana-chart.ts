import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tesseract from "tesseract.js";

const require = createRequire(import.meta.url);
const english = require("@tesseract.js-data/eng") as { langPath: string; gzip?: boolean };
const japanese = require("@tesseract.js-data/jpn") as { langPath: string; gzip?: boolean };

const KANA = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

type OcrWorker = Awaited<ReturnType<typeof tesseract.createWorker>>;
type Box = { left: number; top: number; width: number; height: number };

// A full-page English read of a kana chart comes back as short Latin tokens and drops the cells.
export function shouldTryKatakanaChart(text: string): boolean {
  if ((text.match(/[ァ-ヶー]/g) ?? []).length >= 5) return true;
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const hasLongWord = words.some((word) => /[A-Za-z]{6,}/.test(word));
  return !hasLongWord && words.length >= 12;
}

export async function readKatakanaChart(data: Uint8Array): Promise<string | null> {
  const image = Buffer.from(data);
  const segmenter = await openWorker("jpn", tesseract.OEM.LSTM_ONLY, japanese.langPath, japanese.gzip !== false);
  try {
    await segmenter.setParameters({ user_defined_dpi: "300", tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT });
    const tsv = (await segmenter.recognize(image, {}, { tsv: true })).data.tsv ?? "";
    const { page, words } = parseWords(tsv);
    const cells = cellsOf(words, page);
    if (cells.length < 12) return null;
    const kanaWorker = await openWorker("jpn", tesseract.OEM.TESSERACT_ONLY, japanese.langPath, japanese.gzip !== false);
    const latinWorker = await openWorker("eng", tesseract.OEM.LSTM_ONLY, english.langPath, english.gzip !== false);
    try {
      const lines: string[] = [];
      for (const cell of cells) {
        const line = await readCell(image, cell, kanaWorker, segmenter, latinWorker);
        if (line) lines.push(line);
      }
      if (lines.length < 5) return null;
      return lines.join("\n");
    } finally {
      await kanaWorker.terminate().catch(() => undefined);
      await latinWorker.terminate().catch(() => undefined);
    }
  } finally {
    await segmenter.terminate().catch(() => undefined);
  }
}

function openWorker(lang: string, oem: tesseract.OEM, langPath: string, gzip: boolean): Promise<OcrWorker> {
  return tesseract.createWorker(lang, oem, {
    langPath,
    gzip,
    cachePath: join(tmpdir(), "rev-tesseract"),
    logger: () => undefined,
  });
}

function parseWords(tsv: string): { page: Box; words: Box[] } {
  const rows = tsv.split("\n").map((line) => line.split("\t"));
  const pageRow = rows.find((cols) => cols[0] === "1");
  const page = {
    left: 0,
    top: 0,
    width: Number(pageRow?.[8] ?? 0),
    height: Number(pageRow?.[9] ?? 0),
  };
  const words = rows
    .filter((cols) => cols[0] === "5" && (cols[11] ?? "").trim())
    .map((cols) => ({
      left: Number(cols[6]),
      top: Number(cols[7]),
      width: Number(cols[8]),
      height: Number(cols[9]),
    }))
    .filter((box) => box.width >= 2 && box.height >= 6);
  return { page, words };
}

function bands(centers: number[], gap: number): Array<{ start: number; end: number }> {
  const sorted = [...centers].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const center of sorted) {
    const group = groups[groups.length - 1];
    if (group && center - group[group.length - 1] <= gap) group.push(center);
    else groups.push([center]);
  }
  return groups.map((group) => ({ start: group[0], end: group[group.length - 1] }));
}

function cellsOf(words: Box[], page: Box): Array<{ box: Box; boxes: Box[] }> {
  if (page.width < 1 || page.height < 1 || words.length < 12) return [];
  const rowBands = bands(
    words.map((word) => word.top + word.height / 2),
    22,
  );
  const columnBands = bands(
    words.map((word) => word.left + word.width / 2),
    48,
  );
  if (rowBands.length < 4 || columnBands.length < 3) return [];
  const cells: Array<{ box: Box; boxes: Box[] }> = [];
  for (const row of rowBands) {
    const rowWords = words.filter((word) => {
      const center = word.top + word.height / 2;
      return center >= row.start - 8 && center <= row.end + 8;
    });
    if (rowWords.length === 0) continue;
    const top = Math.max(0, Math.min(...rowWords.map((word) => word.top)) - 3);
    const bottom = Math.min(page.height, Math.max(...rowWords.map((word) => word.top + word.height)) + 3);
    for (const column of columnBands) {
      const inCell = rowWords.filter((word) => {
        const center = word.left + word.width / 2;
        return center >= column.start - 8 && center <= column.end + 8;
      });
      if (inCell.length === 0) continue;
      const left = Math.max(0, Math.min(column.start, ...inCell.map((word) => word.left)) - 6);
      const right = Math.min(page.width, Math.max(column.end, ...inCell.map((word) => word.left + word.width)) + 20);
      cells.push({
        box: {
          left: Math.round(left),
          top: Math.round(top),
          width: Math.max(1, Math.round(right - left)),
          height: Math.max(1, Math.round(bottom - top)),
        },
        boxes: inCell,
      });
    }
  }
  return cells;
}

function splitAt(cell: Box, boxes: Box[]): number {
  const sorted = [...boxes].sort((a, b) => a.left - b.left);
  let bestGap = 0;
  let at = cell.left + Math.round(cell.width * 0.5);
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const gapStart = sorted[index].left + sorted[index].width;
    const gap = sorted[index + 1].left - gapStart;
    if (gap > bestGap) {
      bestGap = gap;
      at = Math.round((gapStart + sorted[index + 1].left) / 2);
    }
  }
  return Math.min(cell.left + cell.width - 8, Math.max(cell.left + 8, at));
}

async function readCell(
  image: Buffer,
  cell: { box: Box; boxes: Box[] },
  kanaWorker: OcrWorker,
  kanaFallback: OcrWorker,
  latinWorker: OcrWorker,
): Promise<string | null> {
  const at = splitAt(cell.box, cell.boxes);
  const leftWidth = at - cell.box.left;
  const rightWidth = cell.box.left + cell.box.width - at;
  if (leftWidth < 4 || rightWidth < 4) return null;
  const left = { left: cell.box.left, top: cell.box.top, width: leftWidth, height: cell.box.height };
  const right = { left: at, top: cell.box.top, width: rightWidth, height: cell.box.height };
  let kana = await textOf(kanaWorker, image, left, tesseract.PSM.SINGLE_CHAR, KANA);
  if (!kana) kana = await textOf(kanaFallback, image, left, tesseract.PSM.SINGLE_CHAR, KANA);
  if (!kana) kana = await textOf(kanaWorker, image, cell.box, tesseract.PSM.SINGLE_WORD, KANA);
  if ([...kana].length !== 1 || !KANA.includes(kana)) return null;
  let romaji = (await textOf(latinWorker, image, right, tesseract.PSM.SINGLE_LINE, LETTERS)).toLowerCase();
  if (!/^[a-z]{1,3}$/.test(romaji)) {
    romaji = (await textOf(latinWorker, image, right, tesseract.PSM.SINGLE_WORD, LETTERS)).toLowerCase();
  }
  if (!/^[a-z]{1,3}$/.test(romaji)) return null;
  return `${kana} ${romaji}`;
}

async function textOf(
  worker: OcrWorker,
  image: Buffer,
  rectangle: Box,
  psm: tesseract.PSM,
  whitelist: string,
): Promise<string> {
  await worker.setParameters({
    user_defined_dpi: "70",
    tessedit_pageseg_mode: psm,
    tessedit_char_whitelist: whitelist,
  });
  return ((await worker.recognize(image, { rectangle })).data.text ?? "").replace(/\s+/g, "").trim();
}
