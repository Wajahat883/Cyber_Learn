import type { Question } from '@cyberlearn/shared';

export interface AnswerInput {
  questionId: string;
  selectedOptionIndex?: number;
  text?: string;
}

export interface GradedAnswer {
  questionId: string;
  selectedOptionIndex: number | null;
  text: string;
  correct: boolean;
  score: number;
  maxScore: number;
  feedback: string;
  relatedConcept: string;
  sectionId: string;
  /** Rubric points / key ideas the open answer did not mention. */
  missing: string[];
}

const STOP = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'into', 'are', 'was', 'for', 'have', 'has', 'not', 'but', 'you', 'your', 'can', 'will', 'its', 'which', 'when', 'what', 'their', 'they', 'then', 'than', 'also', 'more', 'such', 'should', 'would']);
const words = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP.has(w)));

/**
 * Open answers are scored deterministically against the rubric (or the model
 * answer's key ideas): each idea counts when most of its significant words
 * appear in the learner's answer. Feedback always shows the model answer, so
 * the learner can judge nuance themselves.
 */
function coverage(ideas: string[], answer: Set<string>) {
  const covered = ideas.filter((idea) => {
    const w = [...words(idea)];
    if (!w.length) return false;
    return w.filter((x) => answer.has(x)).length / w.length >= 0.5;
  });
  return { score: ideas.length ? covered.length / ideas.length : 0, missing: ideas.filter((i) => !covered.includes(i)) };
}

function gradeOpen(q: Question, text: string) {
  const answer = words(text);
  const keyIdeas = (q.answer.match(/[^.!?]+[.!?]?/g) ?? [q.answer]).map((s) => s.trim()).filter((s) => s.length > 8).slice(0, 5);
  // Rubrics may be checkable key points or general criteria; use whichever the answer can be matched against best.
  const byRubric = q.rubric.length ? coverage(q.rubric, answer) : { score: 0, missing: [] as string[] };
  const byAnswer = coverage(keyIdeas, answer);
  const best = byRubric.score >= byAnswer.score && q.rubric.length ? byRubric : byAnswer;
  return { score: Math.round(best.score * 100) / 100, missing: best.missing };
}

export function gradeAnswer(q: Question, input: AnswerInput | undefined): GradedAnswer {
  const base = { questionId: q.id, relatedConcept: q.relatedConcept, sectionId: q.sectionId, maxScore: 1 };
  if (q.type === 'mcq' || q.type === 'true-false') {
    const selected = input?.selectedOptionIndex ?? null;
    const correct = selected !== null && selected === q.correctOptionIndex;
    return {
      ...base,
      selectedOptionIndex: selected,
      text: '',
      correct,
      score: correct ? 1 : 0,
      feedback: `${correct ? 'Correct.' : `The correct answer is “${q.options[q.correctOptionIndex ?? 0]}”.`} ${q.explanation}`,
      missing: [],
    };
  }
  const text = (input?.text ?? '').trim();
  const { score, missing } = text ? gradeOpen(q, text) : { score: 0, missing: q.rubric };
  return {
    ...base,
    selectedOptionIndex: null,
    text: text.slice(0, 5000),
    correct: score >= 0.6,
    score,
    feedback: `${q.explanation}\n\nModel answer: ${q.answer}`,
    missing,
  };
}
