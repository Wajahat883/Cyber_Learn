import { Router } from 'express';
import { z } from 'zod';
import { PresentationManifestSchema, UpdatePresentationSchema, type PresentationManifest } from '@cyberlearn/shared';
import { findOwned } from '../../middleware/authorize.js';
import { validate, validateIds } from '../../middleware/validate.js';
import { Lesson, Presentation, PresentationVersion } from '../../models/index.js';
import { recordActivity } from '../../services/activity.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { param, userId } from '../../utils/http.js';

export const presentationsRouter = Router();

presentationsRouter.get('/lessons/:id/presentation', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const lesson = await findOwned(Lesson, param(req, 'id'), ownerId, 'Lesson');
  const presentation = await Presentation.findOne({ ownerId, lessonId: lesson._id }).lean();
  if (!presentation) throw notFound('Presentation');
  res.json({ presentation });
});

/** Saves slide edits. The whole manifest is re-validated so events never target missing elements. */
presentationsRouter.patch('/presentations/:id', validateIds('id'), validate(UpdatePresentationSchema), async (req, res) => {
  const presentation = await findOwned(Presentation, param(req, 'id'), userId(req), 'Presentation');
  const manifest = presentation.manifest as PresentationManifest;
  const next = { ...manifest, ...(req.body.title ? { title: req.body.title } : {}), ...(req.body.slides ? { slides: req.body.slides } : {}) };
  const parsed = PresentationManifestSchema.safeParse(next);
  if (!parsed.success) throw badRequest('The presentation is not valid', z.flattenError(parsed.error));
  presentation.set({ manifest: parsed.data, ...(req.body.title ? { title: req.body.title } : {}) });
  if (req.body.playbackSettings) presentation.set({ playbackSettings: { ...presentation.toObject().playbackSettings, ...req.body.playbackSettings } });
  presentation.markModified('manifest');
  await presentation.save();
  res.json({ presentation });
});

const VersionSchema = z.object({ label: z.string().trim().max(120).default('') });

/** Saves the current manifest as a named version (presentation version history). */
presentationsRouter.post('/presentations/:id/versions', validateIds('id'), validate(VersionSchema), async (req, res) => {
  const ownerId = userId(req);
  const presentation = await findOwned(Presentation, param(req, 'id'), ownerId, 'Presentation');
  const version = await PresentationVersion.create({ ownerId, presentationId: presentation._id, version: presentation.version, label: req.body.label, manifest: presentation.manifest });
  presentation.version += 1;
  presentation.set({ manifest: { ...(presentation.manifest as PresentationManifest), version: presentation.version } });
  presentation.markModified('manifest');
  await presentation.save();
  await recordActivity({ ownerId, type: 'presentation_version', projectId: presentation.projectId, lessonId: presentation.lessonId, detail: req.body.label });
  res.status(201).json({ version: { version: version.version, label: version.label, createdAt: version.createdAt }, presentation });
});

presentationsRouter.get('/presentations/:id/versions', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const presentation = await findOwned(Presentation, param(req, 'id'), ownerId, 'Presentation');
  const versions = await PresentationVersion.find({ ownerId, presentationId: presentation._id }).sort({ version: -1 }).select('version label createdAt manifest.slides.id').limit(100).lean();
  res.json({ versions: versions.map((v) => ({ version: v.version, label: v.label, createdAt: v.createdAt, slideCount: (v.manifest as PresentationManifest).slides.length })) });
});

presentationsRouter.post('/presentations/:id/versions/:version/restore', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const presentation = await findOwned(Presentation, param(req, 'id'), ownerId, 'Presentation');
  const version = await PresentationVersion.findOne({ ownerId, presentationId: presentation._id, version: Number(req.params.version) }).lean();
  if (!version) throw notFound('Version');
  // Keep the current state too, so restoring is itself reversible.
  await PresentationVersion.create({ ownerId, presentationId: presentation._id, version: presentation.version, label: `Before restoring v${version.version}`, manifest: presentation.manifest });
  presentation.version += 1;
  const lesson = await Lesson.findById(presentation.lessonId).select('diagrams').lean();
  const restored = { ...(version.manifest as PresentationManifest), version: presentation.version };
  // Diagrams may have been edited since; fall back to the lesson's current diagrams when needed.
  const parsed = PresentationManifestSchema.safeParse(restored);
  presentation.set({ manifest: parsed.success ? parsed.data : PresentationManifestSchema.parse({ ...restored, diagrams: lesson?.diagrams ?? [] }) });
  presentation.markModified('manifest');
  await presentation.save();
  res.json({ presentation });
});
