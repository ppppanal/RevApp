import { extractText, getDocumentProxy } from "unpdf";
import { AppError } from "../errors";

const maxPdfPages = 50;

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
    const { text } = await extractText(pdf, { mergePages: false });
    return text.join("\n\n");
  } finally {
    await pdf.destroy().catch(() => undefined);
  }
}
