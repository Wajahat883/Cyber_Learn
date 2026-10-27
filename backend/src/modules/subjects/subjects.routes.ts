import { Router } from 'express';
import { Types } from 'mongoose';
import { LearningPathSchema, SubjectSchema } from '@cyberlearn/shared';
import { findOwned } from '../../middleware/authorize.js';
import { validate, validateIds } from '../../middleware/validate.js';
import { LearningPath, Project, Subject } from '../../models/index.js';
import { conflict } from '../../utils/errors.js';
import { param, userId } from '../../utils/http.js';

export const subjectsRouter = Router();

subjectsRouter.get('/subjects', async (req, res) => {
  const ownerId = userId(req);
  const subjects = await Subject.find({ ownerId }).sort({ createdAt: 1 }).lean();
  const counts = await Project.aggregate<{ _id: unknown; count: number }>([
    { $match: { ownerId: new Types.ObjectId(ownerId) } },
    { $group: { _id: '$subjectId', count: { $sum: 1 } } },
  ]);
  const countBy = new Map(counts.map((c) => [String(c._id), c.count]));
  res.json({ subjects: subjects.map((s) => ({ ...s, projectCount: countBy.get(String(s._id)) ?? 0 })) });
});

subjectsRouter.post('/subjects', validate(SubjectSchema), async (req, res) => {
  const ownerId = userId(req);
  if (await Subject.exists({ ownerId, name: req.body.name }).collation({ locale: 'en', strength: 2 })) {
    throw conflict('A subject with this name already exists');
  }
  const subject = await Subject.create({ ...req.body, ownerId });
  res.status(201).json({ subject });
});

subjectsRouter.patch('/subjects/:id', validateIds('id'), validate(SubjectSchema.partial()), async (req, res) => {
  const subject = await findOwned(Subject, param(req, 'id'), userId(req), 'Subject');
  subject.set(req.body);
  await subject.save();
  res.json({ subject });
});

/** Deleting a subject keeps its projects; they simply become unassigned. */
subjectsRouter.delete('/subjects/:id', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const subject = await findOwned(Subject, param(req, 'id'), ownerId, 'Subject');
  await Project.updateMany({ ownerId, subjectId: subject._id }, { $set: { subjectId: null } });
  await LearningPath.deleteMany({ ownerId, subjectId: subject._id });
  await subject.deleteOne();
  res.status(204).end();
});

subjectsRouter.get('/learning-paths', async (req, res) => {
  const filter: Record<string, unknown> = { ownerId: userId(req) };
  if (typeof req.query.subjectId === 'string' && req.query.subjectId.length === 24) filter.subjectId = req.query.subjectId;
  const paths = await LearningPath.find(filter).sort({ createdAt: 1 }).lean();
  res.json({ learningPaths: paths });
});

async function assertPathRefs(ownerId: string, subjectId: string, modules: { projectIds: string[] }[]) {
  await findOwned(Subject, subjectId, ownerId, 'Subject');
  const ids = [...new Set(modules.flatMap((m) => m.projectIds))];
  if (ids.length && (await Project.countDocuments({ ownerId, _id: { $in: ids } })) !== ids.length) {
    throw conflict('A module references a project you do not own');
  }
}

subjectsRouter.post('/learning-paths', validate(LearningPathSchema), async (req, res) => {
  const ownerId = userId(req);
  await assertPathRefs(ownerId, req.body.subjectId, req.body.modules);
  const path = await LearningPath.create({ ...req.body, ownerId });
  res.status(201).json({ learningPath: path });
});

subjectsRouter.patch('/learning-paths/:id', validateIds('id'), validate(LearningPathSchema.partial()), async (req, res) => {
  const ownerId = userId(req);
  const path = await findOwned(LearningPath, param(req, 'id'), ownerId, 'Learning path');
  await assertPathRefs(ownerId, req.body.subjectId ?? String(path.subjectId), req.body.modules ?? []);
  path.set(req.body);
  await path.save();
  res.json({ learningPath: path });
});

subjectsRouter.delete('/learning-paths/:id', validateIds('id'), async (req, res) => {
  const path = await findOwned(LearningPath, param(req, 'id'), userId(req), 'Learning path');
  await path.deleteOne();
  res.status(204).end();
});
