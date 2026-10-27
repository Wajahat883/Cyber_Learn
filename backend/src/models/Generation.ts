import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { GENERATION_STAGES, type StageResult } from '@cyberlearn/shared';

const stageResultSchema = new Schema(
  {
    stage: { type: String, enum: GENERATION_STAGES, required: true },
    status: { type: String, enum: ['pending', 'running', 'completed', 'failed', 'skipped'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    startedAt: { type: String },
    completedAt: { type: String },
    error: { type: String },
    detail: { type: String },
  },
  { _id: false },
);

/** Tracks one asynchronous generation run. Only safe diagnostics are stored, never secrets. */
const generationSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    sourceIds: [{ type: Schema.Types.ObjectId, ref: 'Source' }],
    preferences: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['queued', 'running', 'awaiting_review', 'completed', 'partially_completed', 'failed', 'cancelled'],
      default: 'queued',
    },
    currentStage: { type: String, enum: [...GENERATION_STAGES, null], default: null },
    stageResults: { type: [stageResultSchema], default: [] },
    autoContinue: { type: Boolean, default: false },
    cancelRequested: { type: Boolean, default: false },
    /** The plan from the content analyzer, editable on the preview screen. */
    analysis: { type: Schema.Types.Mixed, default: null },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', default: null },
    presentationId: { type: Schema.Types.ObjectId, ref: 'Presentation', default: null },
    attemptCount: { type: Number, default: 0 },
    errorCode: { type: String, default: '' },
    errorMessage: { type: String, default: '' },
    usage: {
      aiCalls: { type: Number, default: 0 },
      inputChars: { type: Number, default: 0 },
      outputChars: { type: Number, default: 0 },
    },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

generationSchema.index({ ownerId: 1, createdAt: -1 });
generationSchema.index({ ownerId: 1, status: 1 });
generationSchema.index({ projectId: 1, createdAt: -1 });

export type GenerationDoc = HydratedDocument<InferSchemaType<typeof generationSchema>> & { stageResults: StageResult[] };
export const Generation = model('Generation', generationSchema);
