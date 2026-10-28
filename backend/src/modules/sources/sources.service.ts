import { Types } from 'mongoose';
import { Project, Source, SourceChunk } from '../../models/index.js';
import { chunkText, extractHeadings, normalizeText, type TextChunk } from '../../services/text.js';
import { storage } from '../../config/storage.js';
import { extractDocument, ExtractionError, validateUpload } from '../../services/extraction.js';
import { sha256 } from '../../utils/crypto.js';
import { badRequest, conflict } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/** An unfinished source older than this is considered abandoned (its request crashed) and may be replaced. */
const STUCK_PROCESSING_MS = 5 * 60_000;

/**
 * Duplicate detection. Only a successfully extracted source counts as a duplicate;
 * a failed (or abandoned) earlier attempt with the same content is removed, with
 * its stored file, so the material can be uploaded again.
 */
async function findDuplicate(ownerId: string, projectId: string, contentHash: string) {
  const existing = await Source.find({ ownerId, projectId, contentHash });
  let duplicate: (typeof existing)[number] | null = null;
  for (const source of existing) {
    if (source.extractionStatus === 'completed') {
      duplicate ??= source;
      continue;
    }
    const age = Date.now() - new Date(source.get('createdAt') as Date).getTime();
    if (source.extractionStatus === 'processing' && age < STUCK_PROCESSING_MS) throw conflict('This file is already being processed');
    if (source.storageKey) await storage.delete(source.storageKey).catch((err) => logger.warn({ err, key: source.storageKey }, 'Failed to delete stored file of a failed source'));
    await SourceChunk.deleteMany({ ownerId, sourceId: source._id });
    await source.deleteOne();
  }
  return duplicate;
}

export interface ExtractedDocument {
  /** One entry per page for paginated formats, a single entry otherwise. */
  pages: string[];
}

export function buildChunks(doc: ExtractedDocument): { chunks: TextChunk[]; text: string } {
  const normalizedPages = doc.pages.map(normalizeText);
  const paginated = normalizedPages.length > 1;
  const chunks: TextChunk[] = [];
  normalizedPages.forEach((pageText, i) => {
    if (pageText) chunks.push(...chunkText(pageText, paginated ? i + 1 : 0, chunks.length));
  });
  return { chunks, text: normalizedPages.join('\n\n') };
}

/** Persists chunks for a source and marks it completed. */
export async function saveChunks(sourceId: Types.ObjectId, ownerId: string, projectId: unknown, doc: ExtractedDocument) {
  const { chunks, text } = buildChunks(doc);
  if (!chunks.length) throw new ExtractionError('No readable text was found in this source');
  await SourceChunk.deleteMany({ sourceId });
  await SourceChunk.insertMany(chunks.map((c) => ({ ...c, ownerId, projectId, sourceId })));
  await Source.updateOne(
    { _id: sourceId },
    {
      $set: {
        extractionStatus: 'completed',
        extractionError: '',
        chunkCount: chunks.length,
        charCount: text.length,
        'metadata.headings': extractHeadings(text),
        'metadata.pageCount': doc.pages.length > 1 ? doc.pages.length : 0,
      },
    },
  );
}

export async function markProjectHasSource(projectId: unknown) {
  await Project.updateOne({ _id: projectId, 'status.content': 'empty' }, { $set: { 'status.content': 'source_added' } });
}

export async function createTextSource(input: { ownerId: string; projectId: string; title: string; text: string; tags: string[] }) {
  const normalized = normalizeText(input.text);
  const contentHash = sha256(normalized);
  // Re-submitting identical material returns the existing source instead of processing it twice.
  const existing = await findDuplicate(input.ownerId, input.projectId, contentHash);
  if (existing) return { source: existing, duplicate: true };

  const source = await Source.create({
    ownerId: input.ownerId,
    projectId: input.projectId,
    title: input.title,
    sourceType: 'text',
    mimeType: 'text/plain',
    sizeBytes: Buffer.byteLength(normalized),
    contentHash,
    extractionStatus: 'processing',
    tags: input.tags,
  });
  await saveChunks(source._id, input.ownerId, input.projectId, { pages: [normalized] });
  await markProjectHasSource(input.projectId);
  return { source: (await Source.findById(source._id))!, duplicate: false };
}

export async function getSourceText(ownerId: string, sourceIds: string[]) {
  const chunks = await SourceChunk.find({ ownerId, sourceId: { $in: sourceIds } })
    .sort({ sourceId: 1, index: 1 })
    .lean();
  return chunks;
}

const safeName = (name: string) =>
  name
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 80) || 'upload';

/**
 * Upload flow (spec 13): validate type and signature, store the original
 * privately, extract text in the sandbox, chunk it and record the source.
 * Extraction problems produce a clear error instead of an incomplete lesson.
 */
export async function createUploadedSource(input: { ownerId: string; projectId: string; filename: string; buffer: Buffer; title?: string }) {
  const meta = await validateUpload(input.filename, input.buffer);
  const contentHash = sha256(input.buffer);
  const existing = await findDuplicate(input.ownerId, input.projectId, contentHash);
  if (existing) return { source: existing, duplicate: true };

  const source = await Source.create({
    ownerId: input.ownerId,
    projectId: input.projectId,
    title: input.title ?? input.filename.replace(/\.[^.]+$/, '').slice(0, 200),
    sourceType: 'upload',
    originalFilename: input.filename.slice(0, 255),
    mimeType: meta.mimeType,
    sizeBytes: input.buffer.length,
    contentHash,
    extractionStatus: 'processing',
  });
  const key = `users/${input.ownerId}/projects/${input.projectId}/sources/${source._id}-${safeName(input.filename)}`;
  await storage.put(key, input.buffer, meta.mimeType);
  source.storageKey = key;
  await source.save();

  try {
    const pages = await extractDocument(meta.kind, input.buffer);
    await saveChunks(source._id, input.ownerId, input.projectId, { pages });
  } catch (err) {
    // Parser internals (stack-ish messages, library names) are logged, not shown.
    const message = err instanceof ExtractionError ? err.message : 'This file could not be read. It may be damaged or in an unsupported format.';
    if (!(err instanceof ExtractionError)) logger.warn({ err, sourceId: String(source._id), kind: meta.kind }, 'Document extraction failed');
    await Source.updateOne({ _id: source._id }, { $set: { extractionStatus: 'failed', extractionError: message.slice(0, 300) } });
    throw badRequest(message);
  }
  await markProjectHasSource(input.projectId);
  return { source: (await Source.findById(source._id))!, duplicate: false };
}
