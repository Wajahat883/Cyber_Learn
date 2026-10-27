import { Types } from 'mongoose';
import { Activity, Flashcard, FlashcardReview, Generation, Lesson, Presentation, Progress, Project, QuizAttempt } from '../../models/index.js';

const oid = (id: string) => new Types.ObjectId(id);

/** Concepts the user keeps getting wrong in quizzes and flashcards. */
export async function weakTopics(ownerId: string, limit = 8) {
  const quizMistakes = await QuizAttempt.aggregate<{ _id: { concept: string; lessonId: unknown }; wrong: number; total: number }>([
    { $match: { ownerId: oid(ownerId) } },
    { $unwind: '$answers' },
    { $match: { 'answers.relatedConcept': { $nin: ['', null] } } },
    {
      $group: {
        _id: { concept: '$answers.relatedConcept', lessonId: '$lessonId' },
        wrong: { $sum: { $cond: ['$answers.correct', 0, 1] } },
        total: { $sum: 1 },
      },
    },
    { $match: { wrong: { $gt: 0 } } },
  ]);

  const cardLapses = await FlashcardReview.aggregate<{ _id: unknown; lapses: number; reviews: number }>([
    { $match: { ownerId: oid(ownerId), lapses: { $gt: 0 } } },
    { $group: { _id: '$flashcardId', lapses: { $sum: '$lapses' }, reviews: { $sum: '$reviewCount' } } },
  ]);
  const cards = await Flashcard.find({ _id: { $in: cardLapses.map((c) => c._id) } })
    .select('conceptId front lessonId')
    .lean();
  const cardById = new Map(cards.map((c) => [String(c._id), c]));

  const topics = new Map<string, { concept: string; lessonId: string; mistakes: number; attempts: number }>();
  for (const q of quizMistakes) {
    const key = `${q._id.lessonId}:${q._id.concept.toLowerCase()}`;
    topics.set(key, { concept: q._id.concept, lessonId: String(q._id.lessonId), mistakes: q.wrong, attempts: q.total });
  }
  for (const c of cardLapses) {
    const card = cardById.get(String(c._id));
    if (!card) continue;
    const concept = card.conceptId || card.front.slice(0, 80);
    const key = `${card.lessonId}:${concept.toLowerCase()}`;
    const existing = topics.get(key) ?? { concept, lessonId: String(card.lessonId), mistakes: 0, attempts: 0 };
    existing.mistakes += c.lapses;
    existing.attempts += c.reviews;
    topics.set(key, existing);
  }

  const list = [...topics.values()].sort((a, b) => b.mistakes - a.mistakes).slice(0, limit);
  const lessons = await Lesson.find({ _id: { $in: list.map((t) => t.lessonId) }, ownerId }).select('title').lean();
  const titles = new Map(lessons.map((l) => [String(l._id), l.title]));
  return list.map((t) => ({ ...t, lessonTitle: titles.get(t.lessonId) ?? '' }));
}

export async function dueRevisionCount(ownerId: string) {
  const [due, reviewedIds] = await Promise.all([
    FlashcardReview.countDocuments({ ownerId, nextReviewAt: { $lte: new Date() } }),
    FlashcardReview.distinct('flashcardId', { ownerId }),
  ]);
  const unseen = await Flashcard.countDocuments({ ownerId, _id: { $nin: reviewedIds } });
  return { due, unseen, total: due + unseen };
}

/** Consecutive days (ending today or yesterday) with real study activity. */
export async function studyStreak(ownerId: string) {
  const days = await Activity.aggregate<{ _id: string }>([
    { $match: { ownerId: oid(ownerId), type: { $in: ['study_time', 'section_completed', 'flashcard_review', 'quiz_attempt'] } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } },
    { $sort: { _id: -1 } },
    { $limit: 400 },
  ]);
  const set = new Set(days.map((d) => d._id));
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const cursor = new Date();
  if (!set.has(dayKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (set.has(dayKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export async function dashboard(ownerId: string) {
  const [totalProjects, totalLessons, totalPresentations, completedLessons, recentProjects, runningGenerations, attempts, continueProgress, due, weak, streak] =
    await Promise.all([
      Project.countDocuments({ ownerId }),
      Lesson.countDocuments({ ownerId }),
      Presentation.countDocuments({ ownerId }),
      Progress.countDocuments({ ownerId, completionStatus: 'completed' }),
      Project.find({ ownerId }).sort({ updatedAt: -1 }).limit(6).lean(),
      Generation.find({ ownerId, status: { $in: ['queued', 'running', 'awaiting_review'] } })
        .sort({ createdAt: -1 })
        .select('projectId status currentStage createdAt')
        .populate('projectId', 'title')
        .lean(),
      QuizAttempt.find({ ownerId }).select('score maxScore').lean(),
      Progress.find({ ownerId, lastStudiedAt: { $ne: null } }).sort({ lastStudiedAt: -1 }).limit(5).lean(),
      dueRevisionCount(ownerId),
      weakTopics(ownerId, 5),
      studyStreak(ownerId),
    ]);

  const lessonIds = continueProgress.map((p) => p.lessonId);
  const lessons = await Lesson.find({ _id: { $in: lessonIds }, ownerId }).select('title sections.id projectId').lean();
  const lessonById = new Map(lessons.map((l) => [String(l._id), l]));
  const recentlyStudied = continueProgress
    .map((p) => {
      const lesson = lessonById.get(String(p.lessonId));
      if (!lesson) return null;
      const total = (lesson.sections as unknown[]).length || 1;
      return {
        lessonId: String(p.lessonId),
        projectId: String(lesson.projectId),
        title: lesson.title,
        completion: Math.round((p.completedSections.length / total) * 100),
        completionStatus: p.completionStatus,
        lastStudiedAt: p.lastStudiedAt,
      };
    })
    .filter(Boolean);

  const scored = attempts.filter((a) => a.maxScore > 0);
  const quizAverage = scored.length ? Math.round((scored.reduce((s, a) => s + a.score / a.maxScore, 0) / scored.length) * 100) : null;

  return {
    stats: { totalProjects, totalLessons, totalPresentations, completedLessons, quizAverage, quizAttempts: scored.length, streak },
    continueLearning: recentlyStudied[0] ?? null,
    recentlyStudied,
    recentProjects,
    runningGenerations,
    revision: due,
    weakTopics: weak,
  };
}
