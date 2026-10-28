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
    /** Optional embedding vector for semantic Ask (computed lazily; never loaded unless selected). */
    embedding: { type: [Number], default: undefined, select: false },
    /** Model that produced `embedding`; vectors from another model are recomputed. */
    embeddingModel: { type: String, default: undefined, select: false },
  },
  { timestamps: false },
);

sourceChunkSchema.index({ sourceId: 1, index: 1 }, { unique: true });
sourceChunkSchema.index({ ownerId: 1, projectId: 1 });
// Owner-scoped text index: library search always filters by owner, so the owner is the index prefix
// (an equality match on ownerId is then required for $text queries, which every caller does).
const CHUNK_TEXT_INDEX = 'owner_text_search';
sourceChunkSchema.index({ ownerId: 1, text: 'text', heading: 'text' }, { name: CHUNK_TEXT_INDEX });

export const SourceChunk = model('SourceChunk', sourceChunkSchema);

// A collection can have only one text index: replace the old unscoped one on existing databases.
SourceChunk.on('index', (err?: Error) => {
  if (!err || !/text index|IndexOptionsConflict|equivalent index/i.test(err.message)) return;
  SourceChunk.collection
    .dropIndex('text_text_heading_text')
    .then(() => SourceChunk.createIndexes())
    .catch(() => undefined);
});
