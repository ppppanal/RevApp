export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_STUDY_MODEL = "google/gemma-4-31b-it:free";

const GOOGLE_HOST = "generativelanguage.googleapis.com";

export function studyChatTarget(baseUrl: string, model: string): { baseUrl: string; model: string } {
  if (isGoogleGenerativeLanguage(baseUrl)) {
    return { baseUrl: OPENROUTER_BASE_URL, model: OPENROUTER_STUDY_MODEL };
  }
  return { baseUrl, model };
}

export function isGoogleGenerativeLanguage(value: string): boolean {
  try {
    return new URL(value).hostname.toLowerCase() === GOOGLE_HOST;
  } catch {
    return false;
  }
}
