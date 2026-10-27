import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { UpdateProfileSchema } from '@cyberlearn/shared';
import { env } from '../../config/env.js';
import { storage } from '../../config/storage.js';
import { clearSessionCookie, setSessionCookie } from '../../middleware/authenticate.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import {
  Activity,
  Asset,
  Flashcard,
  FlashcardReview,
  Generation,
  LearningPath,
  Lesson,
  Presentation,
  Progress,
  Project,
  QuestionBookmark,
  Quiz,
  QuizAttempt,
  Source,
  SourceChunk,
  Subject,
  User,
} from '../../models/index.js';
import { deleteProjectData } from '../../services/projectData.js';
import { verifyPassword } from '../../utils/crypto.js';
import { AppError } from '../../utils/errors.js';
import { userId } from '../../utils/http.js';
import { publicUser } from '../auth/auth.service.js';

export const accountRouter = Router();

accountRouter.patch('/account/profile', validate(UpdateProfileSchema), async (req, res) => {
  const user = await User.findById(userId(req));
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
  if (req.body.displayName) user.displayName = req.body.displayName;
  if (req.body.preferences) user.set({ preferences: { ...user.toObject().preferences, ...req.body.preferences } });
  await user.save();
  res.json({ user: publicUser(user) });
});

/** Usage, generation history, storage and provider configuration for the Settings screen. */
accountRouter.get('/account/overview', async (req, res) => {
  const ownerId = userId(req);
  const owner = new Types.ObjectId(ownerId);
  const [user, generations, assetBytes, sourceBytes, counts] = await Promise.all([
    User.findById(ownerId).lean(),
    Generation.find({ ownerId }).sort({ createdAt: -1 }).limit(20).select('projectId status createdAt completedAt usage errorMessage').populate('projectId', 'title').lean(),
    Asset.aggregate<{ _id: string; bytes: number; count: number }>([{ $match: { ownerId: owner } }, { $group: { _id: '$assetType', bytes: { $sum: '$sizeBytes' }, count: { $sum: 1 } } }]),
    Source.aggregate<{ bytes: number; count: number }>([{ $match: { ownerId: owner } }, { $group: { _id: null, bytes: { $sum: '$sizeBytes' }, count: { $sum: 1 } } }]),
    Promise.all([Project.countDocuments({ ownerId }), Lesson.countDocuments({ ownerId }), Presentation.countDocuments({ ownerId })]),
  ]);
  res.json({
    usage: user?.usage,
    generations,
    storage: {
      sources: { bytes: sourceBytes[0]?.bytes ?? 0, count: sourceBytes[0]?.count ?? 0 },
      assets: assetBytes.map((a) => ({ type: a._id, bytes: a.bytes, count: a.count })),
      totalBytes: (sourceBytes[0]?.bytes ?? 0) + assetBytes.reduce((s, a) => s + a.bytes, 0),
    },
    counts: { projects: counts[0], lessons: counts[1], presentations: counts[2] },
    // Provider names only — API keys stay server-side and are never returned.
    providers: {
      text: { provider: env.AI_TEXT_PROVIDER, model: env.AI_TEXT_PROVIDER === 'mock' ? 'offline heuristics' : env.AI_TEXT_MODEL || 'default', configured: env.AI_TEXT_PROVIDER === 'mock' || Boolean(env.AI_TEXT_API_KEY || env.AI_TEXT_BASE_URL) },
      image: { provider: env.AI_IMAGE_PROVIDER, model: env.AI_IMAGE_MODEL || '' },
      speech: { provider: env.AI_SPEECH_PROVIDER, model: env.AI_SPEECH_MODEL || '' },
      storage: env.STORAGE_DRIVER,
    },
  });
});

/** Signs out every other session by rotating the session version. */
accountRouter.post('/account/logout-all', async (req, res) => {
  const user = await User.findByIdAndUpdate(userId(req), { $inc: { sessionVersion: 1 } }, { new: true });
  if (user) setSessionCookie(res, String(user._id), user.sessionVersion);
  res.status(204).end();
});

/** Full data export / backup of everything the user owns (spec 4.14, 17). */
accountRouter.get('/account/export', authLimiter, async (req, res) => {
  const ownerId = userId(req);
  const filter = { ownerId };
  const [user, subjects, learningPaths, projects, sources, chunks, lessons, presentations, flashcards, flashcardReviews, quizzes, quizAttempts, progress] = await Promise.all([
    User.findById(ownerId).lean(),
    Subject.find(filter).lean(),
    LearningPath.find(filter).lean(),
    Project.find(filter).lean(),
    Source.find(filter).lean(),
    SourceChunk.find(filter).sort({ sourceId: 1, index: 1 }).lean(),
    Lesson.find(filter).lean(),
    Presentation.find(filter).lean(),
    Flashcard.find(filter).lean(),
    FlashcardReview.find(filter).lean(),
    Quiz.find(filter).lean(),
    QuizAttempt.find(filter).lean(),
    Progress.find(filter).lean(),
  ]);
  const backup = {
    format: 'cyberlearn-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    user: user ? publicUser(user) : null,
    subjects,
    learningPaths,
    projects,
    sources: sources.map((s) => ({ ...s, extractedText: chunks.filter((c) => String(c.sourceId) === String(s._id)).map((c) => c.text) })),
    lessons,
    presentations,
    flashcards,
    flashcardReviews,
    quizzes,
    quizAttempts,
    progress,
  };
  res.attachment(`cyberlearn-backup-${new Date().toISOString().slice(0, 10)}.json`).type('application/json').send(JSON.stringify(backup, null, 2));
});

const DeleteSchema = z.object({ password: z.string().min(1).max(200), confirm: z.literal('DELETE') });

/** Deletes the account and every document and file belonging to it. */
accountRouter.delete('/account', authLimiter, validate(DeleteSchema), async (req, res) => {
  const ownerId = userId(req);
  const user = await User.findById(ownerId).select('+passwordHash');
  if (!user || !(await verifyPassword(req.body.password, user.passwordHash))) throw new AppError(401, 'INVALID_CREDENTIALS', 'Password is incorrect');
  for (const p of await Project.find({ ownerId }).select('_id').lean()) await deleteProjectData(ownerId, String(p._id));
  const leftovers = await Asset.find({ ownerId }).select('+storageKey').lean();
  for (const a of leftovers) if (a.storageKey) await storage.delete(a.storageKey).catch(() => undefined);
  await Promise.all([
    Asset.deleteMany({ ownerId }),
    Subject.deleteMany({ ownerId }),
    LearningPath.deleteMany({ ownerId }),
    Activity.deleteMany({ ownerId }),
    FlashcardReview.deleteMany({ ownerId }),
    QuestionBookmark.deleteMany({ ownerId }),
    QuizAttempt.deleteMany({ ownerId }),
    Generation.deleteMany({ ownerId }),
  ]);
  await user.deleteOne();
  clearSessionCookie(res);
  res.status(204).end();
});
