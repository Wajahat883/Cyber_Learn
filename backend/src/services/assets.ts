import { Types } from 'mongoose';
import { storage } from '../config/storage.js';
import { Asset, type AssetType } from '../models/index.js';
import { sha256 } from '../utils/crypto.js';

const EXT: Record<string, string> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/markdown': 'md',
  'application/json': 'json',
  'application/zip': 'zip',
};

export function storageKey(ownerId: string, projectId: unknown, id: string, mimeType: string) {
  return `users/${ownerId}/projects/${String(projectId ?? 'none')}/assets/${id}.${EXT[mimeType] ?? 'bin'}`;
}

/** Writes a file to private storage and records (or updates) its Asset document. */
export async function storeAsset(input: {
  assetId?: string;
  ownerId: string;
  projectId?: unknown;
  lessonId?: unknown;
  assetType: AssetType;
  body: Buffer;
  mimeType: string;
  filename?: string;
  metadata?: Record<string, unknown>;
}) {
  const id = input.assetId ?? String(new Types.ObjectId());
  const key = storageKey(input.ownerId, input.projectId, `${id}-${Date.now().toString(36)}`, input.mimeType);
  await storage.put(key, input.body, input.mimeType);
  const existing = input.assetId ? await Asset.findById(id) : null;
  const previousKey = existing?.storageKey;
  const doc = existing ?? new Asset({ _id: id, ownerId: input.ownerId, projectId: input.projectId ?? null, lessonId: input.lessonId ?? null, assetType: input.assetType });
  doc.set({
    storageKey: key,
    mimeType: input.mimeType,
    sizeBytes: input.body.length,
    checksum: sha256(input.body),
    filename: input.filename ?? doc.filename,
    status: 'ready',
    error: '',
  });
  if (input.metadata) doc.set({ generationMetadata: { ...(doc.toObject().generationMetadata ?? {}), ...input.metadata } });
  await doc.save();
  if (previousKey && previousKey !== key) await storage.delete(previousKey).catch(() => undefined);
  return doc;
}
