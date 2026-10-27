import { Types } from 'mongoose';
import { Activity, Flashcard, FlashcardReview, Generation, Lesson, Presentation, Progress, Project, Quiz, QuizAttempt } from '../../models/index.js';

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

/** Learning statistics for the progress screen (spec 4.13). Every number comes from recorded activity. */
export async function progressSummary(ownerId: string) {
  const owner = oid(ownerId);
  const since = new Date(Date.now() - 30 * 86400000);
  const [lessons, progress, attempts, reviews, daily, streak, weak] = await Promise.all([
    Lesson.find({ ownerId }).select('title sections.id projectId createdAt').lean(),
    Progress.find({ ownerId }).lean(),
    QuizAttempt.find({ ownerId }).sort({ submittedAt: 1 }).select('quizId lessonId score maxScore submittedAt answers.questionId answers.correct').lean(),
    FlashcardReview.find({ ownerId }).select('reviewCount correctCount lapses').lean(),
    Activity.aggregate<{ _id: string; seconds: number }>([
      { $match: { ownerId: owner, type: 'study_time', createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, seconds: { $sum: '$seconds' } } },
      { $sort: { _id: 1 } },
    ]),
    studyStreak(ownerId),
    weakTopics(ownerId, 10),
  ]);

  const progressByLesson = new Map(progress.map((p) => [String(p.lessonId), p]));
  const attemptsByLesson = new Map<string, number>();
  for (const a of attempts) {
    const pct = a.maxScore ? a.score / a.maxScore : 0;
    attemptsByLesson.set(String(a.lessonId), Math.max(attemptsByLesson.get(String(a.lessonId)) ?? 0, pct));
  }
  const perLesson = lessons.map((l) => {
    const p = progressByLesson.get(String(l._id));
    const total = (l.sections as unknown[]).length || 1;
    return {
      lessonId: String(l._id),
      title: l.title,
      completion: Math.round(((p?.completedSections.length ?? 0) / total) * 100),
      completionStatus: p?.completionStatus ?? 'not_started',
      timeSpentSeconds: p?.timeSpentSeconds ?? 0,
      lastStudiedAt: p?.lastStudiedAt ?? null,
      bestQuizScore: attemptsByLesson.has(String(l._id)) ? Math.round(attemptsByLesson.get(String(l._id))! * 100) : null,
    };
  });

  // Questions answered wrongly in two or more attempts.
  const wrongCounts = new Map<string, { quizId: string; questionId: string; count: number }>();
  for (const a of attempts) {
    for (const ans of a.answers ?? []) {
      if (ans.correct) continue;
      const key = `${a.quizId}:${ans.questionId}`;
      const entry = wrongCounts.get(key) ?? { quizId: String(a.quizId), questionId: ans.questionId ?? '', count: 0 };
      entry.count += 1;
      wrongCounts.set(key, entry);
    }
  }
  const repeated = [...wrongCounts.values()].filter((w) => w.count >= 2).sort((a, b) => b.count - a.count).slice(0, 10);
  const quizzes = await Quiz.find({ ownerId, _id: { $in: repeated.map((r) => r.quizId) } }).select('questions.id questions.prompt lessonId').lean();
  const prompt = (quizId: string, qid: string) => (quizzes.find((q) => String(q._id) === quizId)?.questions as { id: string; prompt: string }[] | undefined)?.find((q) => q.id === qid)?.prompt ?? '';

  const reviewsTotal = reviews.reduce((s, r) => s + r.reviewCount, 0);
  const correctTotal = reviews.reduce((s, r) => s + (r.correctCount ?? 0), 0);
  const scored = attempts.filter((a) => a.maxScore > 0);

  return {
    totals: {
      lessonsCreated: lessons.length,
      lessonsViewed: progress.filter((p) => p.lastStudiedAt).length,
      lessonsCompleted: progress.filter((p) => p.completionStatus === 'completed').length,
      averageCompletion: perLesson.length ? Math.round(perLesson.reduce((s, l) => s + l.completion, 0) / perLesson.length) : 0,
      timeSpentSeconds: progress.reduce((s, p) => s + p.timeSpentSeconds, 0),
      quizAttempts: scored.length,
      averageQuizScore: scored.length ? Math.round((scored.reduce((s, a) => s + a.score / a.maxScore, 0) / scored.length) * 100) : null,
      flashcardReviews: reviewsTotal,
      flashcardAccuracy: reviewsTotal ? Math.round((correctTotal / reviewsTotal) * 100) : null,
      streak,
    },
    dailyStudy: daily.map((d) => ({ date: d._id, minutes: Math.round(d.seconds / 60) })),
    quizHistory: scored.slice(-30).map((a) => ({ date: a.submittedAt, score: Math.round((a.score / a.maxScore) * 100), lessonId: String(a.lessonId) })),
    perLesson,
    repeatedMistakes: repeated.map((r) => ({ ...r, prompt: prompt(r.quizId, r.questionId) })),
    weakTopics: weak,
  };
}
