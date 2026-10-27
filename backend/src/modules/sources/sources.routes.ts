import { Router } from 'express';
import { TextSourceSchema } from '@cyberlearn/shared';
import { storage } from '../../config/storage.js';
import { findOwned } from '../../middleware/authorize.js';
import { validate, validateIds } from '../../middleware/validate.js';
import { Project, Source, SourceChunk } from '../../models/index.js';
import { recordActivity } from '../../services/activity.js';
import { param, userId } from '../../utils/http.js';
import { createTextSource } from './sources.service.js';

export const sourcesRouter = Router();

sourcesRouter.post('/projects/:id/sources/text', validateIds('id'), validate(TextSourceSchema), async (req, res) => {
  const ownerId = userId(req);
  const project = await findOwned(Project, param(req, 'id'), ownerId, 'Project');
  const { source, duplicate } = await createTextSource({ ownerId, projectId: String(project._id), ...req.body });
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
