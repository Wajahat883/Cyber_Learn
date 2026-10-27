import { Types } from 'mongoose';
import { Project, Source, SourceChunk } from '../../models/index.js';
import { chunkText, extractHeadings, normalizeText, type TextChunk } from '../../services/text.js';
import { sha256 } from '../../utils/crypto.js';

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
  if (!chunks.length) throw new Error('No readable text was found in this source');
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
  const existing = await Source.findOne({ ownerId: input.ownerId, projectId: input.projectId, contentHash });
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
