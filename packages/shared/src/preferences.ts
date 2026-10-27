import { z } from 'zod';

export const LanguageSchema = z.enum(['en', 'roman-urdu', 'bilingual']);
export const DifficultySchema = z.enum(['beginner', 'intermediate', 'advanced']);
export const DensitySchema = z.enum(['concise', 'detailed']);
export const VisualModeSchema = z.enum(['diagrams', 'illustrations', 'both']);

export const GenerationPreferencesSchema = z.object({
  language: LanguageSchema.default('en'),
  difficulty: DifficultySchema.default('intermediate'),
  density: DensitySchema.default('detailed'),
  visualMode: VisualModeSchema.default('both'),
  narration: z.boolean().default(true),
  quizzes: z.boolean().default(true),
  flashcards: z.boolean().default(true),
});

export const UserPreferencesSchema = z.object({
  language: LanguageSchema.default('en'),
  difficulty: DifficultySchema.default('intermediate'),
  narrationEnabled: z.boolean().default(true),
  presentationDensity: DensitySchema.default('detailed'),
  visualMode: VisualModeSchema.default('both'),
  playbackSpeed: z.number().min(0.75).max(1.5).default(1),
  captions: z.boolean().default(true),
});

export type Language = z.infer<typeof LanguageSchema>;
export type Difficulty = z.infer<typeof DifficultySchema>;
export type Density = z.infer<typeof DensitySchema>;
export type VisualMode = z.infer<typeof VisualModeSchema>;
export type GenerationPreferences = z.infer<typeof GenerationPreferencesSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
