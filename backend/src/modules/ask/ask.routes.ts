import { Router } from 'express';
import { AskSchema, type LessonSection } from '@cyberlearn/shared';
import { answerFromNotes } from '../../ai/askNotes.js';
import { textProviderFor } from '../../ai/providers/userProviders.js';
import { AiOutputError, AiProviderError } from '../../ai/types.js';
import { findOwned } from '../../middleware/authorize.js';
import { aiLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { Lesson, Source, SourceChunk, User } from '../../models/index.js';
import { loadChunks } from '../../services/chunks.js';
import { AppError } from '../../utils/errors.js';
import { userId } from '../../utils/http.js';

export const askRouter = Router();

const MAX_CONTEXT_CHUNKS = 8;

/**
 * Ask My Notes / "Ask AI about this section": answers only from the user's own
 * material and cites where the answer came from (Roman Urdu section 7).
 */
askRouter.post('/ask', aiLimiter, validate(AskSchema), async (req, res) => {
  const ownerId = userId(req);
  const { question, lessonId, sectionId } = req.body as { question: string; lessonId?: string; sectionId?: string };
  const user = await User.findById(ownerId).select('preferences').lean();

  let chunks;
  if (lessonId) {
    const lesson = await findOwned(Lesson, lessonId, ownerId, 'Lesson');
    const all = await loadChunks(ownerId, lesson.sourceIds);
    const section = sectionId ? (lesson.sections as LessonSection[]).find((s) => s.id === sectionId) : undefined;
    const preferred = new Set(section?.sourceRefs.map((r) => r.chunkIndex) ?? []);
    chunks = [...all.filter((c) => preferred.has(c.index)), ...all.filter((c) => !preferred.has(c.index))].slice(0, MAX_CONTEXT_CHUNKS * 2);
  } else {
    // Library-wide search with MongoDB's text index.
    const hits = await SourceChunk.find({ ownerId, $text: { $search: question } }, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(MAX_CONTEXT_CHUNKS)
      .lean();
    chunks = hits.map((c, i) => ({ index: i, text: c.text, heading: c.heading, page: c.page, sourceId: String(c.sourceId) }));
  }

  if (!chunks.length) {
    res.json({ answer: 'Your notes do not appear to cover this question yet.', supported: false, citations: [] });
    return;
  }

  let result;
  try {
    result = await answerFromNotes(await textProviderFor(ownerId), { question, chunks, language: user?.preferences?.language ?? 'en' });
  } catch (err) {
    if (err instanceof AiProviderError) throw new AppError(err.retryable ? 503 : 502, err.code, err.message);
    if (err instanceof AiOutputError) throw new AppError(502, 'AI_OUTPUT_INVALID', err.message);
    throw err;
  }

  const byIndex = new Map(chunks.map((c) => [c.index, c]));
  const cited = result.data.citedChunks.map((i) => byIndex.get(i)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const sources = await Source.find({ ownerId, _id: { $in: [...new Set(cited.map((c) => c.sourceId))] } }).select('title projectId').lean();
  const sourceById = new Map(sources.map((s) => [String(s._id), s]));
  const lessons = await Lesson.find({ ownerId, projectId: { $in: sources.map((s) => s.projectId) } }).select('_id projectId title').lean();
  const lessonByProject = new Map(lessons.map((l) => [String(l.projectId), l]));

  res.json({
    answer: result.data.answer,
    supported: result.data.supported,
    citations: cited.map((c) => {
      const source = sourceById.get(c.sourceId);
      const lesson = source ? lessonByProject.get(String(source.projectId)) : undefined;
      return {
        sourceId: c.sourceId,
        sourceTitle: source?.title ?? 'Source',
        projectId: source ? String(source.projectId) : null,
        lessonId: lesson ? String(lesson._id) : null,
        lessonTitle: lesson?.title ?? null,
        heading: c.heading,
        page: c.page,
        excerpt: c.text.slice(0, 400),
      };
    }),
  });
});
