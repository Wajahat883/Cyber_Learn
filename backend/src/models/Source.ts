import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** Metadata about pasted text or an uploaded document. The original is preserved, never overwritten. */
const sourceSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true, maxlength: 200 },
    sourceType: { type: String, enum: ['text', 'upload'], required: true },
    originalFilename: { type: String, default: '' },
    storageKey: { type: String, default: '' },
    mimeType: { type: String, default: 'text/plain' },
    sizeBytes: { type: Number, default: 0 },
    contentHash: { type: String, required: true },
    extractionStatus: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
    extractionError: { type: String, default: '' },
    chunkCount: { type: Number, default: 0 },
    charCount: { type: Number, default: 0 },
    tags: { type: [String], default: [] },
    metadata: {
      pageCount: { type: Number, default: 0 },
      headings: { type: [String], default: [] },
    },
  },
  { timestamps: true },
);

sourceSchema.index({ ownerId: 1, projectId: 1, createdAt: -1 });
sourceSchema.index({ ownerId: 1, projectId: 1, contentHash: 1 });

export type SourceDoc = HydratedDocument<InferSchemaType<typeof sourceSchema>>;
export const Source = model('Source', sourceSchema);

/**
 * Extracted text split into bounded chunks so no single document grows
 * without limit (spec 8.3). Chunks keep heading/page for source references.
 */
const sourceChunkSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    sourceId: { type: Schema.Types.ObjectId, ref: 'Source', required: true },
    index: { type: Number, required: true },
    text: { type: String, required: true },
    heading: { type: String, default: '' },
    page: { type: Number, default: 0 },
  },
  { timestamps: false },
);

sourceChunkSchema.index({ sourceId: 1, index: 1 }, { unique: true });
sourceChunkSchema.index({ ownerId: 1, projectId: 1 });
sourceChunkSchema.index({ text: 'text', heading: 'text' });

export const SourceChunk = model('SourceChunk', sourceChunkSchema);
