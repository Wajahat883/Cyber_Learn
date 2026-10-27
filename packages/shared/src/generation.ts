import { z } from 'zod';

/** Pipeline stages in execution order (spec 3.1 / 4.6). */
export const GENERATION_STAGES = [
  'extract',
  'analyze',
  'lesson',
  'assessment',
  'diagrams',
  'images',
  'presentation',
  'narration',
  'finalize',
] as const;

export const GenerationStageSchema = z.enum(GENERATION_STAGES);

export const STAGE_LABELS: Record<GenerationStage, string> = {
  extract: 'Extracting source content',
  analyze: 'Analyzing concepts',
  lesson: 'Writing explanations',
  assessment: 'Creating quizzes and flashcards',
  diagrams: 'Planning visuals and generating diagrams',
  images: 'Generating illustrations',
  presentation: 'Assembling presentation',
  narration: 'Creating narration',
  finalize: 'Saving learning material',
};

/** Stages whose failure must stop the pipeline. Others degrade gracefully (spec 3.1). */
export const CRITICAL_STAGES: GenerationStage[] = ['extract', 'analyze', 'lesson', 'presentation', 'finalize'];

export const StageStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'skipped']);

export const GenerationStatusSchema = z.enum([
  'queued',
  'running',
  'awaiting_review',
  'completed',
  'partially_completed',
  'failed',
  'cancelled',
]);

export const StageResultSchema = z.object({
  stage: GenerationStageSchema,
  status: StageStatusSchema,
  attempts: z.number().int().nonnegative().default(0),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  detail: z.string().optional(),
});

export type GenerationStage = z.infer<typeof GenerationStageSchema>;
export type StageStatus = z.infer<typeof StageStatusSchema>;
export type GenerationStatus = z.infer<typeof GenerationStatusSchema>;
export type StageResult = z.infer<typeof StageResultSchema>;

/** Event pushed to the browser through SSE. */
export interface GenerationEvent {
  generationId: string;
  status: GenerationStatus;
  currentStage?: GenerationStage;
  stageResults: StageResult[];
  lessonId?: string;
  errorMessage?: string;
}

export const ACTIVE_GENERATION_STATUSES: GenerationStatus[] = ['queued', 'running'];
