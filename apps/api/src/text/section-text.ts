const SENTENCE_END = /[.!?。？！]$/;

// A lesson title, not a wrapped sentence. Numbered topics, titles, and short title-case lines.
export function isSectionHeading(text: string): boolean {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line || line.includes("\n") || line.length > 80 || SENTENCE_END.test(line)) return false;
  if (/^[●•▪◦*\-]/.test(line)) return false;
  const letters = line.replace(/[^A-Za-z\u4e00-\u9fff]/g, "");
  if (letters.length < 3) return false;
  if (/^(?:chapter|section|lab|task|part|week|lecture|topic)\b/i.test(line)) return true;
  if (/^\d+(?:\.\d+){1,3}\b/.test(line)) return true;
  if (/^\d+[.)]?\s+\S/.test(line) && line.split(/\s+/).length <= 10) return true;
  if (/^[\u4e00-\u9fff][\u4e00-\u9fff0-9 ·・]{1,24}$/.test(line)) return true;
  const words = line.split(/\s+/);
  if (words.length <= 8 && words.every((word) => /^[A-Z0-9][A-Z0-9:/+-]*$/.test(word) || /^\d+(?:\.\d+)*[.)]?$/.test(word))) {
    return true;
  }
  if (
    words.length >= 1 &&
    words.length <= 6 &&
    words.every((word) => /^[A-Z][\p{L}'’-]{2,}$/u.test(word) || /^\d+(?:\.\d+)*[.)]?$/.test(word))
  ) {
    return true;
  }
  return false;
}

// A slide title or numbered topic, not a one-word term and not a question.
export function isLessonHeading(text: string): boolean {
  const line = text.replace(/\s+/g, " ").trim();
  if (!isSectionHeading(line) || /[?？]/.test(line)) return false;
  const title = line.replace(/^(?:\d+[.)]\s*)+/, "").trim();
  if (/^(?:what|who|when|where|why|how|which|name|define|explain|describe|list)\b/i.test(title)) return false;
  if (/^\d+(?:\.\d+)*[.)]?\s+\S/.test(line)) return true;
  if (/^(?:chapter|section|lab|task|part|week|lecture|topic)\b/i.test(line)) return true;
  return title.split(/\s+/).filter((word) => word.length > 0).length >= 2;
}

function cardCore(text: string): string {
  return text
    .toLowerCase()
    .replace(/^(?:\d+[.)]\s*)+/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlankAnswer(answer: string): boolean {
  const trimmed = answer.replace(/\s+/g, " ").trim();
  if (!trimmed) return true;
  if (/^(?:n\/?a|none|null|nil|tbd|-+|—+)$/i.test(trimmed)) return true;
  return !/[\p{L}\p{N}]/u.test(trimmed);
}

// Drop a heading used as a card, a blank answer, or an answer that only repeats the question.
export function keepFlashcard(card: { question: string; answer: string }): boolean {
  const question = card.question.replace(/\s+/g, " ").trim();
  const answer = card.answer.replace(/\s+/g, " ").trim();
  if (!question || isBlankAnswer(answer)) return false;
  if (isLessonHeading(question)) return false;
  const questionCore = cardCore(question);
  const answerCore = cardCore(answer);
  if (!answerCore || questionCore === answerCore) return false;
  return true;
}

// Screenshot captions, page numbers, and hex dumps are not lesson text.
export function isImageOnlyFragment(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || isSectionHeading(trimmed)) return false;
  if (/^(?:figure|fig\.?|image|screenshot|diagram)\b/i.test(trimmed) && trimmed.length <= 90) return true;
  if (/^(?:page\s+)?\d{1,4}$/i.test(trimmed)) return true;
  const tokens = trimmed.split(/\s+/);
  const words = tokens.filter((token) => /[A-Za-z\u4e00-\u9fff]{2,}/.test(token));
  const letters = trimmed.match(/[A-Za-z\u4e00-\u9fff]/g)?.length ?? 0;
  if (letters < 8 && words.length === 0) return true;
  const hex = tokens.filter((token) => /^[0-9A-Fa-f]{2,}$/.test(token));
  if (hex.length >= 6 && hex.length / tokens.length >= 0.7) return true;
  return false;
}
