import type { ApiErrorCode } from "@rev/shared";

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly noteId?: string;

  constructor(code: ApiErrorCode, message: string, status: number, noteId?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.noteId = noteId;
  }
}

export class GenerationError extends AppError {
  constructor(code: "TIMEOUT" | "INVALID_JSON" | "PROVIDER_ERROR", message: string) {
    super(code, message, 502);
    this.name = "GenerationError";
  }
}
