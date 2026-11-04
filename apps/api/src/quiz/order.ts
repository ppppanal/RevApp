export interface QuizPriority {
  incorrectCount: number;
  correctCount: number;
  position: number;
}

/** Higher miss rate first. Equal rates put the larger miss count first, then note order. */
export function compareQuizPriority(left: QuizPriority, right: QuizPriority): number {
  const leftTotal = left.incorrectCount + left.correctCount;
  const rightTotal = right.incorrectCount + right.correctCount;
  const leftWrong = leftTotal === 0 ? 0 : left.incorrectCount;
  const rightWrong = rightTotal === 0 ? 0 : right.incorrectCount;
  const leftDenom = leftTotal === 0 ? 1 : leftTotal;
  const rightDenom = rightTotal === 0 ? 1 : rightTotal;
  const ratio = rightWrong * leftDenom - leftWrong * rightDenom;
  if (ratio !== 0) return ratio;
  const misses = right.incorrectCount - left.incorrectCount;
  if (misses !== 0) return misses;
  return left.position - right.position;
}
