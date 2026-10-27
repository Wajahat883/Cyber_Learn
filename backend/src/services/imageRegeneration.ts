import { fallbackImageProvider, imageProvider } from '../ai/providers/index.js';
import { Asset, Lesson } from '../models/index.js';
import type { LessonSection } from '@cyberlearn/shared';
import { logger } from '../utils/logger.js';
import { storeAsset } from './assets.js';

/** Regenerates one illustration in place: the asset id stays the same, so slides keep pointing at it. */
export async function regenerateImage(assetId: string) {
  const asset = await Asset.findById(assetId);
  if (!asset || asset.assetType !== 'image') return;
  const lesson = asset.lessonId ? await Lesson.findById(asset.lessonId).lean() : null;
  const section = (lesson?.sections as LessonSection[] | undefined)?.find((s) => s.id === asset.generationMetadata?.sectionId);
  const meta = asset.toObject().generationMetadata ?? { prompt: '' };
  const input = { prompt: meta.prompt || `Illustration for ${lesson?.title ?? 'lesson'}`, title: section?.title ?? lesson?.title ?? 'Lesson', concepts: section?.keyConcepts ?? [], aspectRatio: '16:9' };
  try {
    const img = await imageProvider().generateImage(input);
    await storeAsset({ assetId, ownerId: String(asset.ownerId), projectId: asset.projectId, lessonId: asset.lessonId, assetType: 'image', body: img.body, mimeType: img.mimeType, metadata: { provider: imageProvider().name, model: imageProvider().model, fallback: false } });
  } catch (err) {
    logger.warn({ err, assetId }, 'Image regeneration failed');
    const hadImage = Boolean(asset.storageKey);
    if (!hadImage) {
      const img = await fallbackImageProvider.generateImage(input);
      await storeAsset({ assetId, ownerId: String(asset.ownerId), projectId: asset.projectId, lessonId: asset.lessonId, assetType: 'image', body: img.body, mimeType: img.mimeType, metadata: { provider: fallbackImageProvider.name, fallback: true } });
    }
    await Asset.updateOne({ _id: assetId }, { $set: { status: 'ready', error: 'Regeneration failed; the previous image was kept' } });
  }
}
