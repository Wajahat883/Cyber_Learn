import type { DiagramSpec, LessonSection, PresentationManifest, Question } from '@cyberlearn/shared';
import { storage } from '../config/storage.js';
import { Asset, Flashcard, Lesson, Presentation, Project, Quiz } from '../models/index.js';
import { logger } from '../utils/logger.js';
import { recordActivity } from './activity.js';
import { storeAsset } from './assets.js';
import { buildMarkdown, buildPdf, buildPptx, type ExportLesson } from './exportBuilders.js';

export const EXPORT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  markdown: 'text/markdown',
};

/** Builds a PDF, PPTX or Markdown export in the background (spec 14). */
export async function runExport(assetId: string): Promise<void> {
  const asset = await Asset.findById(assetId);
  if (!asset || !asset.lessonId) return;
  asset.set({ status: 'processing' });
  await asset.save();
  const ownerId = String(asset.ownerId);
  try {
    const lesson = await Lesson.findOne({ _id: asset.lessonId, ownerId }).lean();
    if (!lesson) throw new Error('Lesson no longer exists');
    const exportLesson: ExportLesson = {
      title: lesson.title,
      subject: lesson.subject,
      summary: lesson.summary,
      learningObjectives: lesson.learningObjectives,
      sections: lesson.sections as LessonSection[],
      diagrams: lesson.diagrams as DiagramSpec[],
      warnings: lesson.warnings,
    };
    const includeQuestions = asset.exportOptions?.includeQuestions ?? true;
    const [flashcards, quizzes] = await Promise.all([
      Flashcard.find({ ownerId, lessonId: lesson._id }).select('front back').lean(),
      Quiz.find({ ownerId, lessonId: lesson._id }).lean(),
    ]);
    const extras = {
      flashcards,
      questions: quizzes.flatMap((q) => q.questions as Question[]),
      includeQuestions,
      images: new Map<string, { body: Buffer; mimeType: string }>(),
    };

    let body: Buffer;
    if (asset.assetType === 'pdf') body = await buildPdf(exportLesson, extras);
    else if (asset.assetType === 'markdown') body = Buffer.from(buildMarkdown(exportLesson, extras), 'utf8');
    else {
      const presentation = await Presentation.findOne({ ownerId, lessonId: lesson._id }).lean();
      if (!presentation) throw new Error('This lesson has no presentation yet');
      const manifest = presentation.manifest as PresentationManifest;
      // Raster illustrations are embedded; SVG placeholders are replaced by their labels.
      const images = await Asset.find({ ownerId, _id: { $in: manifest.slides.map((s) => s.imageAssetId).filter(Boolean) }, mimeType: { $in: ['image/png', 'image/jpeg'] }, status: 'ready' })
        .select('+storageKey mimeType')
        .lean();
      for (const img of images) extras.images.set(String(img._id), { body: await storage.get(img.storageKey), mimeType: img.mimeType });
      body = await buildPptx(manifest, extras);
    }

    await storeAsset({ assetId, ownerId, projectId: asset.projectId, lessonId: asset.lessonId, assetType: asset.assetType as 'pdf', body, mimeType: asset.mimeType, filename: asset.filename });
    await Project.updateOne({ _id: asset.projectId }, { $set: { 'status.export': 'ready' } });
    await recordActivity({ ownerId, type: 'export_created', projectId: asset.projectId, lessonId: asset.lessonId, detail: asset.assetType });
  } catch (err) {
    logger.error({ err, assetId }, 'Export failed');
    await Asset.updateOne({ _id: assetId }, { $set: { status: 'failed', error: (err as Error).message?.slice(0, 300) || 'Export failed' } });
    await Project.updateOne({ _id: asset.projectId }, { $set: { 'status.export': 'failed' } });
  }
}
