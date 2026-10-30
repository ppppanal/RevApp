import type { CreateNoteRequest } from "@rev/shared";
import { AppError } from "../errors";
import type { CreateNoteCommand } from "../services/types";

export function toCreateNoteCommand(input: CreateNoteRequest): CreateNoteCommand {
  const title = input.title;
  const subjectName = input.subjectName;
  if (input.source?.kind === "text") {
    return { title, subjectName, source: { kind: "text", text: input.source.text } };
  }
  if (input.source?.kind === "pdf") {
    return { title, subjectName, source: { kind: "pdf", filename: input.source.filename } };
  }
  if (input.source?.kind === "image") {
    return {
      title,
      subjectName,
      source: { kind: "image", filename: input.source.filename, mimeType: input.source.mimeType },
    };
  }
  if (input.text) {
    return { title, subjectName, source: { kind: "text", text: input.text } };
  }
  throw new AppError("VALIDATION", "Provide note text.", 400);
}
