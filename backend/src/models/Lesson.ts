import { Schema, Types, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import type { ConceptRelationship, DiagramSpec, KeyTerm, LessonSection } from '@cyberlearn/shared';

/**
 * Structured lesson content. `sections` and `diagrams` are validated with the
 * shared Zod schemas before every save, so they are stored as flexible
 * sub-documents here.
 */
const lessonSchema = new Schema(
  {
    ownerId: { type: Types.ObjectId, ref: 'User', required: true },
    projectId: { type: Types.ObjectId, ref: 'Project', required: true },
    sourceIds: [{ type: Types.ObjectId, ref: 'Source' }],
    generationId: { type: Types.ObjectId, ref: 'Generation', default: null },
    title: { type: String, required: true, maxlength: 200 },
    subject: { type: String, default: '' },
    difficulty: { type: String, default: 'intermediate' },
    language: { type: String, default: 'en' },
    summary: { type: String, default: '' },
    learningObjectives: { type: [String], default: [] },
    sections: { type: [Schema.Types.Mixed], default: [] },
    keyTerms: { type: [Schema.Types.Mixed], default: [] },
    prerequisites: { type: [String], default: [] },
    conceptLinks: { type: [Schema.Types.Mixed], default: [] },
    diagrams: { type: [Schema.Types.Mixed], default: [] },
    warnings: { type: [String], default: [] },
    generationStatus: { type: String, enum: ['generating', 'ready', 'partial', 'failed'], default: 'generating' },
    version: { type: Number, default: 1 },
    /** Flattened plain text used by the search index and Ask My Notes. */
    searchText: { type: String, default: '', select: false },
  },
  { timestamps: true },
);

lessonSchema.index({ ownerId: 1, projectId: 1 });
lessonSchema.index({ ownerId: 1, updatedAt: -1 });
lessonSchema.index({ title: 'text', summary: 'text', searchText: 'text' });

lessonSchema.pre('save', function () {
  const sections = (this.sections ?? []) as LessonSection[];
  this.searchText = sections
    .map((s) => [s.title, s.definition, s.explanation, s.howItWorks, s.summary, ...(s.keyConcepts ?? [])].join(' '))
    .join('\n')
    .slice(0, 200_000);
});

export type LessonDoc = HydratedDocument<InferSchemaType<typeof lessonSchema>> & {
  sections: LessonSection[];
  diagrams: DiagramSpec[];
  keyTerms: KeyTerm[];
  conceptLinks: ConceptRelationship[];
};
export const Lesson = model('Lesson', lessonSchema);

/** Previous versions are preserved whenever a lesson is edited or regenerated (Roman Urdu section 7). */
const lessonVersionSchema = new Schema(
  {
    ownerId: { type: Types.ObjectId, ref: 'User', required: true },
    lessonId: { type: Types.ObjectId, ref: 'Lesson', required: true },
    version: { type: Number, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    reason: { type: String, default: 'edit' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

lessonVersionSchema.index({ lessonId: 1, version: -1 });

export const LessonVersion = model('LessonVersion', lessonVersionSchema);
