import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AI_PROVIDER_PRESETS, AiSettingsInputSchema, presetById, UpdateProfileSchema, type AiSettingsInput } from '@cyberlearn/shared';
import { buildProvider, listModels, resolveBaseUrl, type ProviderConfig } from '../../ai/providers/userProviders.js';
import { AiOutputError, AiProviderError } from '../../ai/types.js';
import { aiLimiter } from '../../middleware/rateLimit.js';
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
import { decryptSecret, encryptSecret, verifyPassword } from '../../utils/crypto.js';
import { AppError, badRequest } from '../../utils/errors.js';
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
      text: user?.aiSettings?.provider
        ? { provider: presetById(user.aiSettings.provider)?.label ?? user.aiSettings.provider, model: user.aiSettings.model || 'default', configured: true, source: 'yours' }
        : { provider: env.AI_TEXT_PROVIDER, model: env.AI_TEXT_PROVIDER === 'mock' ? 'offline heuristics' : env.AI_TEXT_MODEL || 'default', configured: env.AI_TEXT_PROVIDER === 'mock' || Boolean(env.AI_TEXT_API_KEY || env.AI_TEXT_BASE_URL), source: 'server' },
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

// ---------------------------------------------------------------- AI provider (Settings)

const hint = (key: string) => (key ? `••••${key.slice(-4)}` : '');

/** Current provider settings. The API key itself is never returned, only a hint. */
accountRouter.get('/account/ai', async (req, res) => {
  const user = await User.findById(userId(req)).select('aiSettings').lean();
  const s = user?.aiSettings;
  res.json({
    settings: s?.provider ? { provider: s.provider, model: s.model, baseUrl: s.provider === 'custom' ? s.baseUrl : '', hasKey: Boolean(s.keyHint), keyHint: s.keyHint, updatedAt: s.updatedAt } : null,
    serverDefault: { provider: env.AI_TEXT_PROVIDER, model: env.AI_TEXT_PROVIDER === 'mock' ? '' : env.AI_TEXT_MODEL },
    presets: AI_PROVIDER_PRESETS,
  });
});

/** Builds a provider config from a request, falling back to the saved key when the provider is unchanged. */
async function configFrom(ownerId: string, input: AiSettingsInput): Promise<ProviderConfig> {
  const saved = (await User.findById(ownerId).select('+aiSettings.apiKeyEnc').lean())?.aiSettings;
  let apiKey = input.apiKey ?? '';
  if (!apiKey && saved?.provider === input.provider && saved.apiKeyEnc) apiKey = decryptSecret(saved.apiKeyEnc) ?? '';
  const baseUrl = await resolveBaseUrl(input.provider, input.baseUrl || (saved?.provider === 'custom' ? saved.baseUrl : ''));
  return { provider: input.provider, model: input.model, baseUrl, apiKey };
}

function providerError(err: unknown): never {
  if (err instanceof AiProviderError) throw new AppError(err.retryable ? 503 : 400, err.code, err.message);
  if (err instanceof AiOutputError) throw new AppError(400, 'AI_OUTPUT_INVALID', 'The model answered, but not in the required JSON format. Try a more capable model.');
  throw err;
}

accountRouter.post('/account/ai/models', aiLimiter, validate(AiSettingsInputSchema), async (req, res) => {
  const cfg = await configFrom(userId(req), req.body);
  const preset = presetById(cfg.provider);
  if (preset?.needsKey && !cfg.apiKey) throw badRequest(`Enter your ${preset.label} API key first`);
  try {
    res.json({ models: await listModels(cfg) });
  } catch (err) {
    providerError(err);
  }
});

/** Makes one small structured request, the same way lessons are generated. */
accountRouter.post('/account/ai/test', aiLimiter, validate(AiSettingsInputSchema), async (req, res) => {
  const cfg = await configFrom(userId(req), req.body);
  const provider = buildProvider(cfg);
  const started = Date.now();
  try {
    const { data } = await provider.generateStructured({
      task: 'answer',
      instructions: 'Connection test. Reply with JSON {"answer": "OK", "supported": true, "citedChunks": []}.',
      content: 'test',
      schema: z.object({ answer: z.string(), supported: z.boolean(), citedChunks: z.array(z.number()).default([]) }),
      context: { question: 'test', chunks: [{ index: 0, text: 'connection test ok', heading: '', page: 0, sourceId: '' }], language: 'en' },
      maxTokens: 200,
    });
    res.json({ ok: true, latencyMs: Date.now() - started, model: provider.model, reply: data.answer.slice(0, 80) });
  } catch (err) {
    providerError(err);
  }
});

accountRouter.put('/account/ai', validate(AiSettingsInputSchema), async (req, res) => {
  const ownerId = userId(req);
  const input = req.body as AiSettingsInput;
  const cfg = await configFrom(ownerId, input);
  buildProvider(cfg); // validates provider, key and model before saving
  await User.updateOne(
    { _id: ownerId },
    {
      $set: {
        'aiSettings.provider': cfg.provider,
        'aiSettings.model': cfg.model,
        'aiSettings.baseUrl': cfg.provider === 'custom' ? cfg.baseUrl : '',
        'aiSettings.apiKeyEnc': cfg.apiKey ? encryptSecret(cfg.apiKey) : '',
        'aiSettings.keyHint': hint(cfg.apiKey),
        'aiSettings.updatedAt': new Date(),
      },
    },
  );
  res.json({ saved: true, keyHint: hint(cfg.apiKey) });
});

/** Back to the server default from .env. The stored key is deleted. */
accountRouter.delete('/account/ai', async (req, res) => {
  await User.updateOne({ _id: userId(req) }, { $set: { aiSettings: { provider: '', model: '', baseUrl: '', apiKeyEnc: '', keyHint: '', updatedAt: new Date() } } });
  res.status(204).end();
});
