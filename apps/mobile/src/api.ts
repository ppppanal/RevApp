import type { CreateNoteRequest, Flashcard, NoteResponse, NoteSummary, UpdateFlashcardRequest } from "@rev/shared";

const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/+$/, "");

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export function getApiBaseUrl(): string {
  return baseUrl;
}

export function createNote(body: CreateNoteRequest): Promise<NoteResponse> {
  return request<NoteResponse>("/notes", { method: "POST", body: JSON.stringify(body) });
}

export function listNotes(): Promise<NoteSummary[]> {
  return request<NoteSummary[]>("/notes");
}

export function getNote(id: string): Promise<NoteResponse> {
  return request<NoteResponse>(`/notes/${id}`);
}

export function updateFlashcard(id: string, body: UpdateFlashcardRequest): Promise<Flashcard> {
  return request<Flashcard>(`/flashcards/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError("NETWORK", `Cannot reach the API at ${baseUrl}.`, 0);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(readCode(body), readMessage(body) ?? `Request failed (${response.status}).`, response.status);
  }
  return body as T;
}

function readMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || !("error" in body)) return undefined;
  const error = (body as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" ? error.message : undefined;
}

function readCode(body: unknown): string {
  if (!body || typeof body !== "object" || !("error" in body)) return "INTERNAL";
  const error = (body as { error?: { code?: unknown } }).error;
  return typeof error?.code === "string" ? error.code : "INTERNAL";
}
