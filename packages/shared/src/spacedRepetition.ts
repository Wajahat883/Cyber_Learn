/**
 * SM-2 spaced repetition (spec 4.11 / Roman Urdu "Revision Center").
 * grade: 0 = forgot, 3 = hard, 4 = good, 5 = easy.
 */
export interface ReviewState {
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
}

export const INITIAL_REVIEW_STATE: ReviewState = { repetitions: 0, intervalDays: 0, easeFactor: 2.5 };

export function scheduleReview(state: ReviewState, grade: number, now = new Date()): ReviewState & { nextReviewAt: Date } {
  const q = Math.max(0, Math.min(5, Math.round(grade)));
  let { repetitions, intervalDays, easeFactor } = state;

  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * easeFactor);
  }

  easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  const nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return { repetitions, intervalDays, easeFactor: Number(easeFactor.toFixed(2)), nextReviewAt };
}
