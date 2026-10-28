import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import {
  FlashcardReviewSchema,
  INITIAL_REVIEW_STATE,
  QuizAttemptSchema,
  scheduleReview,
  toPublicQuestion,
  type QuizAttemptInput,
} from '@cyberlearn/shared';
import { findOwned } from '../../middleware/authorize.js';
import { validate, validateIds } from '../../middleware/validate.js';
import { Flashcard, FlashcardReview, Lesson, QuestionBookmark, Quiz, QuizAttempt, type QuizDoc } from '../../models/index.js';
import { recordActivity } from '../../services/activity.js';
import { gradeAnswers } from '../../services/grading.js';
import { textProviderFor } from '../../ai/providers/userProviders.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { param, userId } from '../../utils/http.js';
import { dueRevisionCount, weakTopics } from '../progress/stats.service.js';

export const revisionRouter = Router();

async function withReviews(ownerId: string, cards: { _id: unknown }[]) {
  const reviews = await FlashcardReview.find({ ownerId, flashcardId: { $in: cards.map((c) => c._id) } }).lean();
  const byCard = new Map(reviews.map((r) => [String(r.flashcardId), r]));
  return cards.map((c) => {
    const r = byCard.get(String(c._id));
    return { ...c, review: r ? { nextReviewAt: r.nextReviewAt, intervalDays: r.intervalDays, reviewCount: r.reviewCount, lapses: r.lapses, easeFactor: r.easeFactor } : null };
  });
}

revisionRouter.get('/lessons/:id/flashcards', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const lesson = await findOwned(Lesson, param(req, 'id'), ownerId, 'Lesson');
  const cards = await Flashcard.find({ ownerId, lessonId: lesson._id }).sort({ createdAt: 1 }).lean();
  res.json({ flashcards: await withReviews(ownerId, cards) });
});

/** Revision queue across lessons: due cards first, then cards never studied. */
revisionRouter.get('/flashcards', async (req, res) => {
  const ownerId = userId(req);
  const filter: Record<string, unknown> = { ownerId };
  if (typeof req.query.lessonId === 'string' && req.query.lessonId.length === 24) filter.lessonId = req.query.lessonId;
  const cards = await Flashcard.find(filter).sort({ createdAt: 1 }).limit(500).lean();
  let result = await withReviews(ownerId, cards);
  if (req.query.due === 'true') {
    const now = Date.now();
    result = result
      .filter((c) => !c.review || new Date(c.review.nextReviewAt).getTime() <= now)
      .sort((a, b) => (a.review ? new Date(a.review.nextReviewAt).getTime() : Infinity) - (b.review ? new Date(b.review.nextReviewAt).getTime() : Infinity));
  }
  res.json({ flashcards: result });
});

/** Records a review and reschedules the card with SM-2 spaced repetition. */
revisionRouter.post('/flashcards/:id/review', validateIds('id'), validate(FlashcardReviewSchema), async (req, res) => {
  const ownerId = userId(req);
  const card = await findOwned(Flashcard, param(req, 'id'), ownerId, 'Flashcard');
  const grade = req.body.grade as number;
  const existing = await FlashcardReview.findOne({ ownerId, flashcardId: card._id });
  const state = existing ? { repetitions: existing.repetitions, intervalDays: existing.intervalDays, easeFactor: existing.easeFactor } : INITIAL_REVIEW_STATE;
  const next = scheduleReview(state, grade);
  const review =
    existing ?? new FlashcardReview({ ownerId, flashcardId: card._id, lessonId: card.lessonId, nextReviewAt: next.nextReviewAt });
  review.set({
    repetitions: next.repetitions,
    intervalDays: next.intervalDays,
    easeFactor: next.easeFactor,
    nextReviewAt: next.nextReviewAt,
    lastGrade: grade,
    reviewCount: (review.reviewCount ?? 0) + 1,
    correctCount: (review.correctCount ?? 0) + (grade >= 3 ? 1 : 0),
    lapses: (review.lapses ?? 0) + (grade < 3 ? 1 : 0),
    lastReviewedAt: new Date(),
  });
  await review.save();
  await recordActivity({ ownerId, type: 'flashcard_review', projectId: card.projectId, lessonId: card.lessonId, detail: String(grade) });
  res.json({ review });
});

function publicQuiz(quiz: QuizDoc | Record<string, unknown>) {
  const q = quiz as { questions: Parameters<typeof toPublicQuestion>[0][] };
  return { ...quiz, questions: q.questions.map(toPublicQuestion) };
}

/** Answer keys are never sent before submission (spec 8.9). */
revisionRouter.get('/lessons/:id/quizzes', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const lesson = await findOwned(Lesson, param(req, 'id'), ownerId, 'Lesson');
  const quizzes = await Quiz.find({ ownerId, lessonId: lesson._id }).lean();
  res.json({ quizzes: quizzes.map(publicQuiz) });
});

revisionRouter.get('/quizzes', async (req, res) => {
  const ownerId = userId(req);
  const quizzes = await Quiz.find({ ownerId }).sort({ createdAt: -1 }).limit(200).lean();
  const attempts = await QuizAttempt.aggregate<{ _id: unknown; best: number; last: Date; count: number }>([
    { $match: { ownerId: new Types.ObjectId(ownerId) } },
    { $group: { _id: '$quizId', best: { $max: { $divide: ['$score', { $max: ['$maxScore', 1] }] } }, last: { $max: '$submittedAt' }, count: { $sum: 1 } } },
  ]);
  const stats = new Map(attempts.map((a) => [String(a._id), a]));
  res.json({
    quizzes: quizzes.map((q) => {
      const s = stats.get(String(q._id));
      return { _id: q._id, lessonId: q.lessonId, title: q.title, difficulty: q.difficulty, questionCount: (q.questions as unknown[]).length, attempts: s?.count ?? 0, bestScore: s ? Math.round(s.best * 100) : null, lastAttemptAt: s?.last ?? null };
    }),
  });
});

revisionRouter.get('/quizzes/:id', validateIds('id'), async (req, res) => {
  const quiz = await findOwned(Quiz, param(req, 'id'), userId(req), 'Quiz');
  const bookmarks = await QuestionBookmark.find({ ownerId: userId(req), quizId: quiz._id }).select('questionId').lean();
  res.json({ quiz: publicQuiz(quiz.toObject()), bookmarks: bookmarks.map((b) => b.questionId) });
});

revisionRouter.post('/quizzes/:id/attempts', validateIds('id'), validate(QuizAttemptSchema), async (req, res) => {
  const ownerId = userId(req);
  const quiz = (await findOwned(Quiz, param(req, 'id'), ownerId, 'Quiz')) as QuizDoc;
  const body = req.body as QuizAttemptInput;
  const ids = new Set(quiz.questions.map((q) => q.id));
  if (body.answers.some((a) => !ids.has(a.questionId))) throw badRequest('Answer for an unknown question');
  const byQuestion = new Map(body.answers.map((a) => [a.questionId, a]));
  // Optional AI rubric grading for open answers (AI_RUBRIC_GRADING); falls back to word overlap.
  const provider = await textProviderFor(ownerId).catch(() => undefined);
  const graded = await gradeAnswers(quiz.questions, byQuestion, { provider });
  const score = Math.round(graded.reduce((s, g) => s + g.score, 0) * 100) / 100;
  const attempt = await QuizAttempt.create({
    ownerId,
    quizId: quiz._id,
    lessonId: quiz.lessonId,
    answers: graded.map(({ missing: _m, ...g }) => g),
    score,
    maxScore: graded.length,
    startedAt: body.startedAt ? new Date(body.startedAt) : null,
    submittedAt: new Date(),
  });
  await recordActivity({ ownerId, type: 'quiz_attempt', projectId: quiz.projectId, lessonId: quiz.lessonId, detail: `${score}/${graded.length}` });
  // After submission the full questions, answer keys and explanations are returned.
  res.status(201).json({ attempt, results: graded, questions: quiz.questions });
});

revisionRouter.get('/quizzes/:id/attempts', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const quiz = await findOwned(Quiz, param(req, 'id'), ownerId, 'Quiz');
  const attempts = await QuizAttempt.find({ ownerId, quizId: quiz._id }).sort({ submittedAt: -1 }).limit(50).lean();
  res.json({ attempts });
});

const BookmarkSchema = z.object({ questionId: z.string().min(1).max(80), bookmarked: z.boolean() });

revisionRouter.post('/quizzes/:id/bookmarks', validateIds('id'), validate(BookmarkSchema), async (req, res) => {
  const ownerId = userId(req);
  const quiz = (await findOwned(Quiz, param(req, 'id'), ownerId, 'Quiz')) as QuizDoc;
  if (!quiz.questions.some((q) => q.id === req.body.questionId)) throw notFound('Question');
  if (req.body.bookmarked) {
    await QuestionBookmark.updateOne({ ownerId, quizId: quiz._id, questionId: req.body.questionId }, { $setOnInsert: { ownerId } }, { upsert: true });
  } else {
    await QuestionBookmark.deleteOne({ ownerId, quizId: quiz._id, questionId: req.body.questionId });
  }
  res.status(204).end();
});

/** Questions answered incorrectly in each quiz's latest attempt, plus bookmarked questions (mistake review). */
revisionRouter.get('/revision/review-questions', async (req, res) => {
  const ownerId = userId(req);
  const latest = await QuizAttempt.aggregate<{ _id: unknown; attempt: { answers: { questionId: string; correct: boolean; text: string; selectedOptionIndex: number | null }[]; submittedAt: Date } }>([
    { $match: { ownerId: new Types.ObjectId(ownerId) } },
    { $sort: { submittedAt: -1 } },
    { $group: { _id: '$quizId', attempt: { $first: '$$ROOT' } } },
  ]);
  const bookmarks = await QuestionBookmark.find({ ownerId }).lean();
  const quizIds = [...new Set([...latest.map((l) => String(l._id)), ...bookmarks.map((b) => String(b.quizId))])];
  const quizzes = (await Quiz.find({ ownerId, _id: { $in: quizIds } }).lean()) as unknown as QuizDoc[];
  const quizById = new Map(quizzes.map((q) => [String(q._id), q]));
  const lessons = await Lesson.find({ ownerId, _id: { $in: quizzes.map((q) => q.lessonId) } }).select('title').lean();
  const lessonTitle = new Map(lessons.map((l) => [String(l._id), l.title]));

  const mistakes = latest.flatMap((l) => {
    const quiz = quizById.get(String(l._id));
    if (!quiz) return [];
    return l.attempt.answers
      .filter((a) => !a.correct)
      .map((a) => {
        const question = quiz.questions.find((q) => q.id === a.questionId);
        return question ? { quizId: String(quiz._id), lessonId: String(quiz.lessonId), lessonTitle: lessonTitle.get(String(quiz.lessonId)) ?? '', question, yourAnswer: a, answeredAt: l.attempt.submittedAt } : null;
      })
      .filter(Boolean);
  });
  const bookmarked = bookmarks
    .map((b) => {
      const quiz = quizById.get(String(b.quizId));
      const question = quiz?.questions.find((q) => q.id === b.questionId);
      return quiz && question ? { quizId: String(quiz._id), lessonId: String(quiz.lessonId), lessonTitle: lessonTitle.get(String(quiz.lessonId)) ?? '', question } : null;
    })
    .filter(Boolean);
  res.json({ mistakes, bookmarked });
});

/** Everything due for revision today (spec 7.6). */
revisionRouter.get('/revision/due', async (req, res) => {
  const ownerId = userId(req);
  const [counts, weak, upcoming] = await Promise.all([
    dueRevisionCount(ownerId),
    weakTopics(ownerId, 10),
    FlashcardReview.aggregate<{ _id: string; count: number }>([
      { $match: { ownerId: new Types.ObjectId(ownerId), nextReviewAt: { $gt: new Date(), $lt: new Date(Date.now() + 14 * 86400000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$nextReviewAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  res.json({ ...counts, weakTopics: weak, schedule: upcoming.map((u) => ({ date: u._id, count: u.count })) });
});
