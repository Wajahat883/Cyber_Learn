import { z } from 'zod';

export const SourceReferenceSchema = z.object({
  sourceId: z.string().max(40).optional(),
  chunkIndex: z.number().int().nonnegative(),
  excerpt: z.string().max(500).default(''),
});

export const CodeSnippetSchema = z.object({
  language: z.string().max(40).default('text'),
  code: z.string().min(1).max(5000),
  caption: z.string().max(300).default(''),
});

/**
 * Whether a section's content comes from the source material, is supplementary
 * explanation added by the AI, or a mix (spec 16 "Source grounding").
 */
export const GroundingSchema = z.enum(['source', 'supplementary', 'mixed']);

/** Fields are Markdown text. Raw HTML is never rendered. */
export const LessonSectionSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  definition: z.string().max(2000).default(''),
  explanation: z.string().max(12000).default(''),
  whyItMatters: z.string().max(3000).default(''),
  howItWorks: z.string().max(6000).default(''),
  example: z.string().max(6000).default(''),
  commonMistakes: z.array(z.string().max(600)).max(15).default([]),
  practicalApplication: z.string().max(4000).default(''),
  summary: z.string().max(2000).default(''),
  prerequisites: z.array(z.string().max(200)).max(15).default([]),
  keyConcepts: z.array(z.string().max(120)).max(20).default([]),
  warnings: z.array(z.string().max(600)).max(10).default([]),
  codeSnippets: z.array(CodeSnippetSchema).max(10).default([]),
  /** Claims that are NOT present in the source and were added as supplementary explanation. */
  supplementaryNotes: z.array(z.string().max(600)).max(15).default([]),
  grounding: GroundingSchema.default('mixed'),
  sourceRefs: z.array(SourceReferenceSchema).max(30).default([]),
  /**
   * Commands, event IDs or queries in this section that do not appear verbatim in the
   * cited source text (set by the generator; absent on older lessons).
   */
  unverifiedClaims: z.array(z.string().max(300)).max(30).optional(),
  /** Set by the server when the learner changed this section's text by hand; an incremental update never overwrites it. */
  manuallyEdited: z.boolean().optional(),
  /** The source passages behind this (hand-edited) section changed in an incremental update: the learner should review it. */
  sourceChanged: z.boolean().optional(),
});

/** What the AI lesson generator must return for one planned section. */
export const GeneratedSectionSchema = LessonSectionSchema.omit({ id: true, title: true, sourceRefs: true, unverifiedClaims: true, manuallyEdited: true, sourceChanged: true }).extend({
  sourceChunks: z.array(z.number().int().nonnegative()).max(30).default([]),
});

export type SourceReference = z.infer<typeof SourceReferenceSchema>;
export type CodeSnippet = z.infer<typeof CodeSnippetSchema>;
export type Grounding = z.infer<typeof GroundingSchema>;
export type LessonSection = z.infer<typeof LessonSectionSchema>;
export type GeneratedSection = z.infer<typeof GeneratedSectionSchema>;
