import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const projectSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 2000 },
    /** Subject detected by the content analyzer. */
    subject: { type: String, default: '', maxlength: 120 },
    tags: { type: [String], default: [] },
    /**
     * Separate states so partial progress is never mistaken for a complete
     * project (spec 4.12).
     */
    status: {
      content: { type: String, enum: ['empty', 'source_added', 'generating', 'awaiting_review', 'ready', 'failed'], default: 'empty' },
      media: { type: String, enum: ['none', 'generating', 'ready', 'partial', 'failed'], default: 'none' },
      export: { type: String, enum: ['none', 'generating', 'ready', 'failed'], default: 'none' },
    },
    preferences: {
      language: { type: String, default: 'en' },
      difficulty: { type: String, default: 'intermediate' },
      density: { type: String, default: 'detailed' },
      visualMode: { type: String, default: 'both' },
      narration: { type: Boolean, default: true },
      quizzes: { type: Boolean, default: true },
      flashcards: { type: Boolean, default: true },
    },
    favorite: { type: Boolean, default: false },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', default: null },
    lastStudiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

projectSchema.index({ ownerId: 1, updatedAt: -1 });
projectSchema.index({ ownerId: 1, subject: 1 });
projectSchema.index({ ownerId: 1, subjectId: 1 });
projectSchema.index({ title: 'text', description: 'text', tags: 'text', subject: 'text' });

export type ProjectDoc = HydratedDocument<InferSchemaType<typeof projectSchema>>;
export const Project = model('Project', projectSchema);
