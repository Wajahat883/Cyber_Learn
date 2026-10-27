import { Router } from 'express';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { PresentationManifestSchema, type PresentationManifest } from '@cyberlearn/shared';
import { storage } from '../../config/storage.js';
import { findOwned } from '../../middleware/authorize.js';
import { aiLimiter, uploadLimiter } from '../../middleware/rateLimit.js';
import { validateIds } from '../../middleware/validate.js';
import { Asset, Presentation } from '../../models/index.js';
import { enqueue } from '../../jobs/queues.js';
import { storeAsset } from '../../services/assets.js';
import { badRequest, conflict } from '../../utils/errors.js';
import { param, userId } from '../../utils/http.js';

export const assetsRouter = Router();

const replaceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

assetsRouter.get('/assets', async (req, res) => {
  const ownerId = userId(req);
  const filter: Record<string, unknown> = { ownerId };
  if (typeof req.query.lessonId === 'string' && req.query.lessonId.length === 24) filter.lessonId = req.query.lessonId;
  if (typeof req.query.type === 'string') filter.assetType = req.query.type;
  const assets = await Asset.find(filter).sort({ createdAt: -1 }).limit(200).select('-storageKey').lean();

  // Where each image is used in the presentation (spec 4.10 "Usage within slides").
  const lessonIds = [...new Set(assets.map((a) => String(a.lessonId)).filter((x) => x !== 'null'))];
  const presentations = await Presentation.find({ ownerId, lessonId: { $in: lessonIds } }).select('manifest.slides.id manifest.slides.title manifest.slides.imageAssetId').lean();
  const usage = new Map<string, { slideId: string; title: string }[]>();
  for (const p of presentations) {
    for (const s of (p.manifest as PresentationManifest).slides) {
      if (s.imageAssetId) usage.set(s.imageAssetId, [...(usage.get(s.imageAssetId) ?? []), { slideId: s.id, title: s.title }]);
    }
  }
  res.json({ assets: assets.map((a) => ({ ...a, usage: usage.get(String(a._id)) ?? [] })) });
});

/**
 * Streams an asset to its owner. Files are never publicly addressable; this
 * ownership-checked stream replaces signed URLs and also works when storage is
 * on an internal network.
 */
assetsRouter.get('/assets/:id/content', validateIds('id'), async (req, res) => {
  const asset = await findOwned(Asset, param(req, 'id'), userId(req), 'Asset', '+storageKey');
  if (asset.status !== 'ready' || !asset.storageKey) throw conflict('This file is not ready yet');
  const body = await storage.get(asset.storageKey);
  res.set({
    'Content-Type': asset.mimeType,
    'Content-Length': String(body.length),
    'Cache-Control': 'private, max-age=300',
    ETag: `"${asset.checksum}"`,
    // SVG illustrations are rendered as images only; block any embedded script.
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });
  if (req.query.download === '1') res.attachment(asset.filename || `${asset._id}`);
  res.send(body);
});

assetsRouter.post('/assets/:id/regenerate', aiLimiter, validateIds('id'), async (req, res) => {
  const asset = await findOwned(Asset, param(req, 'id'), userId(req), 'Asset');
  if (asset.assetType !== 'image') throw badRequest('Only illustrations can be regenerated');
  asset.set({ status: 'processing', error: '' });
  await asset.save();
  await enqueue('media:regenerate-image', { assetId: String(asset._id) }, `img-${asset._id}-${Date.now()}`);
  res.status(202).json({ asset });
});

/** Replaces an illustration with the user's own image (PNG, JPEG or WebP, checked by signature). */
assetsRouter.post('/assets/:id/replace', uploadLimiter, validateIds('id'), replaceUpload.single('file'), async (req, res) => {
  const ownerId = userId(req);
  const asset = await findOwned(Asset, param(req, 'id'), ownerId, 'Asset');
  if (asset.assetType !== 'image') throw badRequest('Only illustrations can be replaced');
  if (!req.file) throw badRequest('Attach an image in the "file" field');
  const type = await fileTypeFromBuffer(req.file.buffer);
  if (!type || !IMAGE_TYPES.has(type.mime)) throw badRequest('Upload a PNG, JPEG or WebP image');
  const updated = await storeAsset({
    assetId: String(asset._id),
    ownerId,
    projectId: asset.projectId,
    lessonId: asset.lessonId,
    assetType: 'image',
    body: req.file.buffer,
    mimeType: type.mime,
    filename: req.file.originalname.slice(0, 120),
    metadata: { provider: 'user-upload', model: '', fallback: false },
  });
  res.json({ asset: updated });
});

/** Removes an illustration from slides (the slide keeps its text and labels). */
assetsRouter.delete('/assets/:id', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const asset = await findOwned(Asset, param(req, 'id'), ownerId, 'Asset', '+storageKey');
  const presentation = asset.lessonId ? await Presentation.findOne({ ownerId, lessonId: asset.lessonId }) : null;
  if (presentation) {
    const manifest = presentation.manifest as PresentationManifest;
    const id = String(asset._id);
    const slides = manifest.slides.map((s) =>
      s.imageAssetId === id ? { ...s, imageAssetId: undefined, events: s.events.filter((e) => e.targetId !== 'image') } : s.narration.audioAssetId === id ? { ...s, narration: { ...s.narration, audioAssetId: undefined } } : s,
    );
    presentation.set({ manifest: PresentationManifestSchema.parse({ ...manifest, slides }) });
    presentation.markModified('manifest');
    await presentation.save();
  }
  if (asset.storageKey) await storage.delete(asset.storageKey).catch(() => undefined);
  await asset.deleteOne();
  res.status(204).end();
});
