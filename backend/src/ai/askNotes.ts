import { z } from 'zod';
import { renderChunks, type ChunkInput } from './contentAnalyzer.js';
import { ANSWER_INSTRUCTIONS } from './prompts/index.js';
import type { TextGenerationProvider } from './types.js';

export const AnswerSchema = z.object({
  answer: z.string().min(1).max(8000),
  supported: z.boolean(),
  citedChunks: z.array(z.number().int().nonnegative()).max(20).default([]),
});

export interface AnswerContext {
  question: string;
  chunks: ChunkInput[];
  language: string;
}

/** Ask My Notes: answers grounded only in the user's own material (Roman Urdu section 7). */
export async function answerFromNotes(provider: TextGenerationProvider, ctx: AnswerContext) {
  return provider.generateStructured({
    task: 'answer',
    instructions: ANSWER_INSTRUCTIONS(ctx.language),
    content: `Question: ${ctx.question}\n\nNotes:\n${renderChunks(ctx.chunks)}`,
    schema: AnswerSchema,
    context: ctx,
  });
}
