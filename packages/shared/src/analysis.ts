import { z } from 'zod';
import { DifficultySchema } from './preferences.js';

/** Visual formats the visual planner may choose from (spec 5.3). */
export const VisualTypeSchema = z.enum([
  'flowchart',
  'architecture',
  'data-flow',
  'timeline',
  'entity-relationship',
  'comparison',
  'sequence',
  'concept-map',
  'code-walkthrough',
  'conceptual-image',
  'chart',
  'decision-flow',
]);

export const PlannedSectionSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  concepts: z.array(z.string().min(1).max(120)).max(20).default([]),
  /** Indexes of the source chunks this section is grounded in. */
  sourceChunks: z.array(z.number().int().nonnegative()).max(50).default([]),
  include: z.boolean().default(true),
});

export const PlannedVisualSchema = z.object({
  id: z.string().min(1).max(80),
  type: VisualTypeSchema,
  purpose: z.string().min(1).max(300),
  sectionId: z.string().min(1).max(80),
});

export const KeyTermSchema = z.object({
  term: z.string().min(1).max(120),
  definition: z.string().max(600).default(''),
});

export const ConceptRelationshipSchema = z.object({
  from: z.string().min(1).max(120),
  to: z.string().min(1).max(120),
  label: z.string().max(120).default('relates to'),
});

/** Output of the content analyzer (spec 5.1). */
export const ContentAnalysisSchema = z
  .object({
    title: z.string().min(1).max(200),
    subject: z.string().min(1).max(120),
    mainTopic: z.string().min(1).max(200),
    difficulty: DifficultySchema,
    summary: z.string().max(2000).default(''),
    learningObjectives: z.array(z.string().min(1).max(300)).max(15).default([]),
    sections: z.array(PlannedSectionSchema).min(1).max(30),
    keyTerms: z.array(KeyTermSchema).max(60).default([]),
    prerequisites: z.array(z.string().min(1).max(200)).max(20).default([]),
    relationships: z.array(ConceptRelationshipSchema).max(80).default([]),
    visuals: z.array(PlannedVisualSchema).max(30).default([]),
    suggestedSlideCount: z.number().int().min(1).max(80),
    warnings: z.array(z.string().max(400)).max(20).default([]),
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    for (const section of value.sections) {
      if (ids.has(section.id)) {
        ctx.addIssue({ code: 'custom', message: `Duplicate section id "${section.id}"`, path: ['sections'] });
      }
      ids.add(section.id);
    }
    value.visuals.forEach((visual, index) => {
      if (!ids.has(visual.sectionId)) {
        ctx.addIssue({
          code: 'custom',
          message: `Visual "${visual.id}" references unknown section "${visual.sectionId}"`,
          path: ['visuals', index, 'sectionId'],
        });
      }
    });
  });

export type VisualType = z.infer<typeof VisualTypeSchema>;
export type PlannedSection = z.infer<typeof PlannedSectionSchema>;
export type PlannedVisual = z.infer<typeof PlannedVisualSchema>;
export type KeyTerm = z.infer<typeof KeyTermSchema>;
export type ConceptRelationship = z.infer<typeof ConceptRelationshipSchema>;
export type ContentAnalysis = z.infer<typeof ContentAnalysisSchema>;
