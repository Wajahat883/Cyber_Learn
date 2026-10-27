import { Router } from 'express';
import multer from 'multer';
import { MAX_UPLOAD_BYTES, TextSourceSchema } from '@cyberlearn/shared';
import { storage } from '../../config/storage.js';
import { findOwned } from '../../middleware/authorize.js';
import { uploadLimiter } from '../../middleware/rateLimit.js';
import { validate, validateIds } from '../../middleware/validate.js';
import { Project, Source, SourceChunk } from '../../models/index.js';
import { recordActivity } from '../../services/activity.js';
import { param, userId } from '../../utils/http.js';
import { badRequest } from '../../utils/errors.js';
import { createTextSource, createUploadedSource } from './sources.service.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 } });

export const sourcesRouter = Router();

sourcesRouter.post('/projects/:id/sources/text', validateIds('id'), validate(TextSourceSchema), async (req, res) => {
  const ownerId = userId(req);
  const project = await findOwned(Project, param(req, 'id'), ownerId, 'Project');
  const { source, duplicate } = await createTextSource({ ownerId, projectId: String(project._id), ...req.body });
  if (!duplicate) await recordActivity({ ownerId, type: 'source_added', projectId: project._id, detail: source.title });
  res.status(duplicate ? 200 : 201).json({ source, duplicate });
});

sourcesRouter.post('/projects/:id/sources/upload', uploadLimiter, validateIds('id'), upload.single('file'), async (req, res) => {
  const ownerId = userId(req);
  const project = await findOwned(Project, param(req, 'id'), ownerId, 'Project');
  if (!req.file) throw badRequest('Attach a file in the "file" field');
  const title = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim().slice(0, 200) : undefined;
  const { source, duplicate } = await createUploadedSource({ ownerId, projectId: String(project._id), filename: req.file.originalname, buffer: req.file.buffer, title });
  if (!duplicate) await recordActivity({ ownerId, type: 'source_added', projectId: project._id, detail: source.title });
  res.status(duplicate ? 200 : 201).json({ source, duplicate });
});

sourcesRouter.get('/projects/:id/sources', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const project = await findOwned(Project, param(req, 'id'), ownerId, 'Project');
  const sources = await Source.find({ ownerId, projectId: project._id }).sort({ createdAt: -1 }).lean();
  res.json({ sources });
});

/** Source details including the extracted text, so the user can view their original material. */
sourcesRouter.get('/sources/:id', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const source = await findOwned(Source, param(req, 'id'), ownerId, 'Source');
  const chunks = await SourceChunk.find({ ownerId, sourceId: source._id }).sort({ index: 1 }).select('index text heading page').lean();
  res.json({ source, chunks });
});

/** Streams the original uploaded file back to its owner. */
sourcesRouter.get('/sources/:id/original', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const source = await findOwned(Source, param(req, 'id'), ownerId, 'Source');
  if (!source.storageKey) {
    const chunks = await SourceChunk.find({ ownerId, sourceId: source._id }).sort({ index: 1 }).lean();
    res.type('text/plain; charset=utf-8').attachment(`${source.title}.txt`).send(chunks.map((c) => c.text).join('\n\n'));
    return;
  }
  const body = await storage.get(source.storageKey);
  res.type(source.mimeType).attachment(source.originalFilename || source.title).send(body);
});

sourcesRouter.delete('/sources/:id', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const source = await findOwned(Source, param(req, 'id'), ownerId, 'Source');
  if (source.storageKey) await storage.delete(source.storageKey);
  await SourceChunk.deleteMany({ ownerId, sourceId: source._id });
  await source.deleteOne();
  if (!(await Source.exists({ ownerId, projectId: source.projectId }))) {
    await Project.updateOne({ _id: source.projectId, ownerId, 'status.content': 'source_added' }, { $set: { 'status.content': 'empty' } });
  }
  res.status(204).end();
});
