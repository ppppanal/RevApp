// Builds a small text-layer PDF for tests. Not used at runtime.
function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export interface PdfGlyph {
  text: string;
  x: number;
  y: number;
  size?: number;
}

export function layoutPdf(pages: PdfGlyph[][]): Uint8Array {
  return textPdfPages(
    pages.map((page) =>
      page
        .filter((glyph) => glyph.text.length > 0)
        .map((glyph) => {
          const size = glyph.size ?? 12;
          return `BT /F1 ${size} Tf 1 0 0 1 ${glyph.x} ${glyph.y} Tm (${escapePdfText(glyph.text)}) Tj ET`;
        })
        .join("\n"),
    ),
  );
}

export function textPdf(lines: string[]): Uint8Array {
  return layoutPdf(lines.map((line) => (line ? [{ text: line, x: 72, y: 720, size: 18 }] : [])));
}

function textPdfPages(streams: string[]): Uint8Array {
  const lines = streams;
  const fontObjectNumber = 3 + lines.length * 2;
  const kids = lines.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${lines.length} >>`,
  ];
  lines.forEach((line, index) => {
    const contentNumber = 4 + index * 2;
    const stream = line;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentNumber} 0 R /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> >>`,
    );
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(body);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body + xref + trailer));
}
