import { Router } from 'express';
import { CreateProjectSchema, ListProjectsQuerySchema, UpdateProjectSchema } from '@cyberlearn/shared';
import type { z } from 'zod';
import { findOwned } from '../../middleware/authorize.js';
import { validate, validateIds } from '../../middleware/validate.js';
import { Activity, Generation, Lesson, Presentation, Project, Source, Subject } from '../../models/index.js';
import { recordActivity } from '../../services/activity.js';
import { deleteProjectData, duplicateProject } from '../../services/projectData.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { escapeRegex, param, userId } from '../../utils/http.js';

export const projectsRouter = Router();

async function assertSubject(ownerId: string, subjectId: string | null | undefined) {
  if (subjectId && !(await Subject.exists({ _id: subjectId, ownerId }))) throw badRequest('Unknown subject');
}

projectsRouter.post('/projects', validate(CreateProjectSchema), async (req, res) => {
  const ownerId = userId(req);
  await assertSubject(ownerId, req.body.subjectId);
  const project = await Project.create({ ...req.body, ownerId });
  await recordActivity({ ownerId, type: 'project_created', projectId: project._id, detail: project.title });
  res.status(201).json({ project });
});

projectsRouter.get('/projects', validate(ListProjectsQuerySchema, 'query'), async (req, res) => {
  const ownerId = userId(req);
  const q = res.locals.query as z.infer<typeof ListProjectsQuerySchema>;
  const filter: Record<string, unknown> = { ownerId };
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ title: rx }, { description: rx }, { tags: rx }, { subject: rx }];
  }
  if (q.subjectId) filter.subjectId = q.subjectId;
  if (q.tag) filter.tags = q.tag;
  if (q.status) filter['status.content'] = q.status;
  if (q.favorite) filter.favorite = q.favorite === 'true';

  const sort: Record<string, 1 | -1> =
    q.sort === 'oldest' ? { createdAt: 1 } : q.sort === 'studied' ? { lastStudiedAt: -1, updatedAt: -1 } : q.sort === 'title' ? { title: 1 } : { updatedAt: -1 };

  const [items, total] = await Promise.all([
    Project.find(filter)
      .sort(sort)
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Project.countDocuments(filter),
  ]);
  res.json({ projects: items, total, page: q.page, pages: Math.max(1, Math.ceil(total / q.limit)) });
});

projectsRouter.get('/projects/:id', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const project = await findOwned(Project, param(req, 'id'), ownerId, 'Project');
  const [sources, generations, lesson, presentation] = await Promise.all([
    Source.find({ ownerId, projectId: project._id }).sort({ createdAt: -1 }).lean(),
    Generation.find({ ownerId, projectId: project._id }).sort({ createdAt: -1 }).limit(10).select('-analysis').lean(),
    project.lessonId ? Lesson.findOne({ _id: project.lessonId, ownerId }).select('title subject generationStatus sections.id sections.title updatedAt version').lean() : null,
    project.lessonId ? Presentation.findOne({ ownerId, lessonId: project.lessonId }).select('_id title version status').lean() : null,
  ]);
  res.json({ project, sources, generations, lesson, presentation });
});

projectsRouter.patch('/projects/:id', validateIds('id'), validate(UpdateProjectSchema), async (req, res) => {
  const ownerId = userId(req);
  const project = await findOwned(Project, param(req, 'id'), ownerId, 'Project');
  await assertSubject(ownerId, req.body.subjectId);
  const { preferences, ...rest } = req.body;
  project.set(rest);
  if (preferences) project.set({ preferences: { ...project.toObject().preferences, ...preferences } });
  await project.save();
  res.json({ project });
});

projectsRouter.delete('/projects/:id', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const project = await findOwned(Project, param(req, 'id'), ownerId, 'Project');
  await deleteProjectData(ownerId, String(project._id));
  res.status(204).end();
});

projectsRouter.post('/projects/:id/duplicate', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const copy = await duplicateProject(ownerId, param(req, 'id'));
  if (!copy) throw notFound('Project');
  await recordActivity({ ownerId, type: 'project_created', projectId: copy._id, detail: copy.title });
  res.status(201).json({ project: copy });
});

projectsRouter.get('/projects/:id/activity', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const project = await findOwned(Project, param(req, 'id'), ownerId, 'Project');
  const activity = await Activity.find({ ownerId, projectId: project._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ activity });
});
