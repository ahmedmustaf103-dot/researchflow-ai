const TITLE_MAX_LENGTH = 80;

export function titleFromQuestion(question: string): string {
  const cleaned = question.trim().replace(/\s+/g, " ");

  if (cleaned.length <= TITLE_MAX_LENGTH) {
    return cleaned;
  }

  return `${cleaned.slice(0, TITLE_MAX_LENGTH - 3)}...`;
}
