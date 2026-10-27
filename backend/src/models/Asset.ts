import { Schema, Types, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const ASSET_TYPES = ['image', 'audio', 'diagram-export', 'pdf', 'pptx', 'markdown', 'backup', 'source-file'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/** Binary files live in object storage; this collection keeps metadata and ownership. */
const assetSchema = new Schema(
  {
    ownerId: { type: Types.ObjectId, ref: 'User', required: true },
    projectId: { type: Types.ObjectId, ref: 'Project', default: null },
    lessonId: { type: Types.ObjectId, ref: 'Lesson', default: null },
    assetType: { type: String, enum: ASSET_TYPES, required: true },
    filename: { type: String, default: '' },
    storageKey: { type: String, default: '' },
    mimeType: { type: String, default: 'application/octet-stream' },
    sizeBytes: { type: Number, default: 0 },
    checksum: { type: String, default: '' },
    generationMetadata: {
      prompt: { type: String, default: '' },
      provider: { type: String, default: '' },
      model: { type: String, default: '' },
      topic: { type: String, default: '' },
      sectionId: { type: String, default: '' },
      slideIds: { type: [String], default: [] },
      durationMs: { type: Number, default: 0 },
      fallback: { type: Boolean, default: false },
    },
    status: { type: String, enum: ['pending', 'processing', 'ready', 'failed'], default: 'pending' },
    error: { type: String, default: '' },
  },
  { timestamps: true },
);

assetSchema.index({ ownerId: 1, lessonId: 1, assetType: 1 });
assetSchema.index({ ownerId: 1, createdAt: -1 });

export type AssetDoc = HydratedDocument<InferSchemaType<typeof assetSchema>>;
export const Asset = model('Asset', assetSchema);
