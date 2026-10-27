import { z } from 'zod';
import { GenerationPreferencesSchema, UserPreferencesSchema } from './preferences.js';
import { ContentAnalysisSchema } from './analysis.js';
import { LessonSectionSchema } from './lesson.js';
import { SlideSchema } from './presentation.js';

/** Request bodies shared by the API (validation) and the frontend (forms). */

export const MAX_PASTED_TEXT_CHARS = 200_000;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const ALLOWED_UPLOAD_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.markdown'] as const;

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(10, 'Use at least 10 characters').max(200);

export const RegisterSchema = z.object({
  email,
  password,
  displayName: z.string().trim().min(1).max(80),
});

export const LoginSchema = z.object({ email, password: z.string().min(1).max(200) });
export const ForgotPasswordSchema = z.object({ email });
export const ResetPasswordSchema = z.object({ token: z.string().min(20).max(200), password });

export const UpdateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  preferences: UserPreferencesSchema.partial().optional(),
});

export const ChangePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: password });

const tags = z.array(z.string().trim().min(1).max(40)).max(20);

export const SubjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).default(''),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#38BDF8'),
  icon: z.string().max(40).default('book'),
});

export const LearningPathSchema = z.object({
  subjectId: z.string().length(24),
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).default(''),
  modules: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(150),
        description: z.string().trim().max(600).default(''),
        projectIds: z.array(z.string().length(24)).max(50).default([]),
      }),
    )
    .max(50)
    .default([]),
});

export const CreateProjectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(''),
  subjectId: z.string().length(24).optional(),
  tags: tags.default([]),
  preferences: GenerationPreferencesSchema.default(GenerationPreferencesSchema.parse({})),
});

export const UpdateProjectSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  subjectId: z.string().length(24).nullable().optional(),
  tags: tags.optional(),
  favorite: z.boolean().optional(),
  preferences: GenerationPreferencesSchema.partial().optional(),
});

export const ListProjectsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  subjectId: z.string().length(24).optional(),
  tag: z.string().trim().max(40).optional(),
  status: z.string().max(40).optional(),
  favorite: z.enum(['true', 'false']).optional(),
  sort: z.enum(['recent', 'oldest', 'studied', 'title']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const TextSourceSchema = z.object({
  title: z.string().trim().min(1).max(200),
  text: z.string().min(20, 'Paste at least a few sentences').max(MAX_PASTED_TEXT_CHARS),
  tags: tags.default([]),
});

export const StartGenerationSchema = z.object({
  sourceIds: z.array(z.string().length(24)).min(1).max(10),
  preferences: GenerationPreferencesSchema.optional(),
  /** When false, pause after analysis so the user can review the plan (Screen 3). */
  autoContinue: z.boolean().default(false),
});

export const ContinueGenerationSchema = z.object({ analysis: ContentAnalysisSchema });

export const UpdateLessonSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  learningObjectives: z.array(z.string().max(300)).max(15).optional(),
  sections: z.array(LessonSectionSchema).max(30).optional(),
});

export const UpdatePresentationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  slides: z.array(SlideSchema).min(1).max(80).optional(),
  playbackSettings: z.object({ speed: z.number().min(0.75).max(1.5), captions: z.boolean() }).partial().optional(),
});

export const FlashcardReviewSchema = z.object({ grade: z.number().int().min(0).max(5) });

export const QuizAttemptSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1).max(80),
        selectedOptionIndex: z.number().int().nonnegative().optional(),
        text: z.string().max(5000).optional(),
      }),
    )
    .max(40),
  startedAt: z.string().datetime().optional(),
});

export const ProgressUpdateSchema = z.object({
  lastSlideViewed: z.number().int().nonnegative().optional(),
  completedSectionId: z.string().max(80).optional(),
  uncompletedSectionId: z.string().max(80).optional(),
  bookmarkSectionId: z.string().max(80).optional(),
  unbookmarkSectionId: z.string().max(80).optional(),
  addTimeSeconds: z.number().int().min(0).max(3600).optional(),
});

export const AskSchema = z.object({
  question: z.string().trim().min(3).max(1000),
  lessonId: z.string().length(24).optional(),
  sectionId: z.string().max(80).optional(),
});

export const ExportRequestSchema = z.object({
  format: z.enum(['pdf', 'pptx', 'markdown']),
  includeQuestions: z.boolean().default(true),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;
export type TextSourceInput = z.infer<typeof TextSourceSchema>;
export type StartGenerationInput = z.infer<typeof StartGenerationSchema>;
export type QuizAttemptInput = z.infer<typeof QuizAttemptSchema>;
export type ProgressUpdateInput = z.infer<typeof ProgressUpdateSchema>;
export type ExportRequestInput = z.infer<typeof ExportRequestSchema>;

/** Central error format returned by every API error (spec 10). */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}
