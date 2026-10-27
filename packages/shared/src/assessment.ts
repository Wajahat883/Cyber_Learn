import { z } from 'zod';
import { DifficultySchema } from './preferences.js';

export const QuestionTypeSchema = z.enum(['mcq', 'true-false', 'short-answer', 'explain', 'log-analysis', 'scenario', 'next-step']);

export const QuestionSchema = z
  .object({
    id: z.string().min(1).max(80),
    type: QuestionTypeSchema,
    prompt: z.string().min(1).max(2000),
    /** Sample logs or scenario evidence shown with the question. */
    context: z.string().max(6000).default(''),
    options: z.array(z.string().min(1).max(400)).max(6).default([]),
    /** Index into options for mcq / true-false. */
    correctOptionIndex: z.number().int().nonnegative().optional(),
    /** Model answer for open questions. */
    answer: z.string().max(3000).default(''),
    explanation: z.string().min(1).max(3000),
    difficulty: DifficultySchema.default('intermediate'),
    relatedConcept: z.string().max(120).default(''),
    sectionId: z.string().max(80).default(''),
    rubric: z.array(z.string().max(300)).max(8).default([]),
  })
  .superRefine((q, ctx) => {
    if (q.type === 'mcq') {
      if (q.options.length < 2) ctx.addIssue({ code: 'custom', message: 'MCQ needs at least 2 options', path: ['options'] });
      if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== q.options.length) {
        ctx.addIssue({ code: 'custom', message: 'MCQ options must be distinct', path: ['options'] });
      }
    }
    if (q.type === 'true-false' && q.options.length !== 2) {
      ctx.addIssue({ code: 'custom', message: 'True/false needs exactly 2 options', path: ['options'] });
    }
    if (q.type === 'mcq' || q.type === 'true-false') {
      if (q.correctOptionIndex === undefined || q.correctOptionIndex >= q.options.length) {
        ctx.addIssue({ code: 'custom', message: 'Missing or invalid correct option', path: ['correctOptionIndex'] });
      }
    } else if (!q.answer.trim()) {
      ctx.addIssue({ code: 'custom', message: 'Open questions need a model answer', path: ['answer'] });
    }
  });

export const FlashcardContentSchema = z.object({
  front: z.string().min(1).max(500),
  back: z.string().min(1).max(1500),
  explanation: z.string().max(2000).default(''),
  conceptId: z.string().max(120).default(''),
  sectionId: z.string().max(80).default(''),
  difficulty: DifficultySchema.default('intermediate'),
});

export const GeneratedAssessmentSchema = z.object({
  flashcards: z.array(FlashcardContentSchema).max(60).default([]),
  questions: z.array(QuestionSchema).max(40).default([]),
});

/** Questions as sent to the client before submission: answer keys removed (spec 8.9). */
export type PublicQuestion = Omit<Question, 'correctOptionIndex' | 'answer' | 'explanation' | 'rubric'>;

export function toPublicQuestion(q: Question): PublicQuestion {
  const { correctOptionIndex: _c, answer: _a, explanation: _e, rubric: _r, ...rest } = q;
  return rest;
}

export type QuestionType = z.infer<typeof QuestionTypeSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type FlashcardContent = z.infer<typeof FlashcardContentSchema>;
export type GeneratedAssessment = z.infer<typeof GeneratedAssessmentSchema>;
