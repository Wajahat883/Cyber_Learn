import { Schema, Types, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import type { PresentationManifest } from '@cyberlearn/shared';

/** Holds the current manifest; validated against PresentationManifestSchema before every save. */
const presentationSchema = new Schema(
  {
    ownerId: { type: Types.ObjectId, ref: 'User', required: true },
    projectId: { type: Types.ObjectId, ref: 'Project', required: true },
    lessonId: { type: Types.ObjectId, ref: 'Lesson', required: true },
    title: { type: String, required: true, maxlength: 200 },
    version: { type: Number, default: 1 },
    manifest: { type: Schema.Types.Mixed, required: true },
    playbackSettings: {
      speed: { type: Number, default: 1 },
      captions: { type: Boolean, default: true },
    },
    status: { type: String, enum: ['draft', 'ready', 'partial'], default: 'ready' },
  },
  { timestamps: true },
);

presentationSchema.index({ ownerId: 1, lessonId: 1 }, { unique: true });
presentationSchema.index({ ownerId: 1, updatedAt: -1 });

export type PresentationDoc = HydratedDocument<InferSchemaType<typeof presentationSchema>> & { manifest: PresentationManifest };
export const Presentation = model('Presentation', presentationSchema);

/** Saved versions for presentation history (spec Phase 7). */
const presentationVersionSchema = new Schema(
  {
    ownerId: { type: Types.ObjectId, ref: 'User', required: true },
    presentationId: { type: Types.ObjectId, ref: 'Presentation', required: true },
    version: { type: Number, required: true },
    label: { type: String, default: '' },
    manifest: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

presentationVersionSchema.index({ presentationId: 1, version: -1 }, { unique: true });

export const PresentationVersion = model('PresentationVersion', presentationVersionSchema);
