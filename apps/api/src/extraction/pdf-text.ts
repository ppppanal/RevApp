import { extractText, getDocumentProxy } from "unpdf";
import { AppError } from "../errors";

const maxPdfPages = 50;

export async function readPdfText(data: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(data);
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
