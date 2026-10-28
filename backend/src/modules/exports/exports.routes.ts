import { Router } from 'express';
import { ExportRequestSchema } from '@cyberlearn/shared';
import { findOwned } from '../../middleware/authorize.js';
import { exportLimiter } from '../../middleware/rateLimit.js';
import { validate, validateIds } from '../../middleware/validate.js';
import { Asset, Lesson, Presentation, Project } from '../../models/index.js';
import { enqueue } from '../../jobs/queues.js';
import { EXPORT_MIME } from '../../services/exports.js';
import { badRequest } from '../../utils/errors.js';
import { param, userId } from '../../utils/http.js';

export const exportsRouter = Router();

const EXT: Record<string, string> = { pdf: 'pdf', pptx: 'pptx', markdown: 'md' };
const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'lesson';

async function requestExport(ownerId: string, lessonId: unknown, projectId: unknown, title: string, format: string, includeQuestions: boolean) {
  const assetType = format as 'pdf' | 'pptx' | 'markdown';
  const asset = await Asset.create({
    ownerId,
    projectId,
    lessonId,
    assetType,
    mimeType: EXPORT_MIME[format],
    filename: `${safe(title)}.${EXT[format]}`,
    exportOptions: { includeQuestions },
    status: 'pending',
  });
  await Project.updateOne({ _id: projectId }, { $set: { 'status.export': 'generating' } });
  try {
    await enqueue('media:export', { assetId: String(asset._id) }, `export-${asset._id}`);
  } catch (err) {
    await Asset.updateOne({ _id: asset._id }, { $set: { status: 'failed', error: 'The job queue is unavailable' } });
    await Project.updateOne({ _id: projectId }, { $set: { 'status.export': 'failed' } });
    throw err;
  }
  return asset;
}

/** Spec 7.5: request an export of a presentation (PPTX) or its lesson notes (PDF, Markdown). */
exportsRouter.post('/presentations/:id/exports', exportLimiter, validateIds('id'), validate(ExportRequestSchema), async (req, res) => {
  const ownerId = userId(req);
  const presentation = await findOwned(Presentation, param(req, 'id'), ownerId, 'Presentation');
  const asset = await requestExport(ownerId, presentation.lessonId, presentation.projectId, presentation.title, req.body.format, req.body.includeQuestions);
  res.status(202).json({ export: asset });
});

exportsRouter.post('/lessons/:id/exports', exportLimiter, validateIds('id'), validate(ExportRequestSchema), async (req, res) => {
  const ownerId = userId(req);
  const lesson = await findOwned(Lesson, param(req, 'id'), ownerId, 'Lesson');
  if (req.body.format === 'pptx' && !(await Presentation.exists({ ownerId, lessonId: lesson._id }))) throw badRequest('This lesson has no presentation yet');
  const asset = await requestExport(ownerId, lesson._id, lesson.projectId, lesson.title, req.body.format, req.body.includeQuestions);
  res.status(202).json({ export: asset });
});

exportsRouter.get('/lessons/:id/exports', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const lesson = await findOwned(Lesson, param(req, 'id'), ownerId, 'Lesson');
  const exports = await Asset.find({ ownerId, lessonId: lesson._id, assetType: { $in: ['pdf', 'pptx', 'markdown'] } })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  res.json({ exports });
});

exportsRouter.get('/exports/:id', validateIds('id'), async (req, res) => {
  const asset = await findOwned(Asset, param(req, 'id'), userId(req), 'Export');
  res.json({ export: asset });
});
