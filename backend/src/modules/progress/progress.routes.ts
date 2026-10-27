import { Router } from 'express';
import { ProgressUpdateSchema, type LessonSection, type ProgressUpdateInput } from '@cyberlearn/shared';
import { findOwned } from '../../middleware/authorize.js';
import { validate, validateIds } from '../../middleware/validate.js';
import { Lesson, Progress, Project } from '../../models/index.js';
import { recordActivity } from '../../services/activity.js';
import { param, userId } from '../../utils/http.js';
import { dashboard } from './stats.service.js';

export const progressRouter = Router();

progressRouter.get('/dashboard', async (req, res) => {
  res.json(await dashboard(userId(req)));
});

progressRouter.get('/lessons/:id/progress', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const lesson = await findOwned(Lesson, param(req, 'id'), ownerId, 'Lesson');
  const progress = await Progress.findOne({ ownerId, lessonId: lesson._id }).lean();
  res.json({ progress: progress ?? { lessonId: lesson._id, lastSlideViewed: 0, completedSections: [], bookmarks: [], timeSpentSeconds: 0, completionStatus: 'not_started', lastStudiedAt: null } });
});

/**
 * Records real study activity. Viewing alone never marks a lesson complete:
 * completion requires every section to be marked as understood (spec 4.13).
 */
progressRouter.patch('/lessons/:id/progress', validateIds('id'), validate(ProgressUpdateSchema), async (req, res) => {
  const ownerId = userId(req);
  const lesson = await findOwned(Lesson, param(req, 'id'), ownerId, 'Lesson');
  const body = req.body as ProgressUpdateInput;
  const sectionIds = new Set((lesson.sections as LessonSection[]).map((s) => s.id));
  const progress =
    (await Progress.findOne({ ownerId, lessonId: lesson._id })) ?? new Progress({ ownerId, lessonId: lesson._id, projectId: lesson.projectId });

  const completed = new Set(progress.completedSections);
  const bookmarks = new Set(progress.bookmarks);
  if (body.completedSectionId && sectionIds.has(body.completedSectionId) && !completed.has(body.completedSectionId)) {
    completed.add(body.completedSectionId);
    await recordActivity({ ownerId, type: 'section_completed', projectId: lesson.projectId, lessonId: lesson._id, detail: body.completedSectionId });
  }
  if (body.uncompletedSectionId) completed.delete(body.uncompletedSectionId);
  if (body.bookmarkSectionId && sectionIds.has(body.bookmarkSectionId)) bookmarks.add(body.bookmarkSectionId);
  if (body.unbookmarkSectionId) bookmarks.delete(body.unbookmarkSectionId);
  if (body.lastSlideViewed !== undefined) progress.lastSlideViewed = body.lastSlideViewed;
  if (body.addTimeSeconds) {
    progress.timeSpentSeconds += body.addTimeSeconds;
    await recordActivity({ ownerId, type: 'study_time', projectId: lesson.projectId, lessonId: lesson._id, seconds: body.addTimeSeconds });
  }

  const done = [...completed].filter((id) => sectionIds.has(id));
  progress.completedSections = done;
  progress.bookmarks = [...bookmarks];
  progress.completionStatus = sectionIds.size > 0 && done.length === sectionIds.size ? 'completed' : done.length || progress.timeSpentSeconds > 0 ? 'in_progress' : 'not_started';
  progress.lastStudiedAt = new Date();
  await progress.save();
  await Project.updateOne({ _id: lesson.projectId, ownerId }, { $set: { lastStudiedAt: progress.lastStudiedAt } });
  res.json({ progress });
});
