import { describe, expect, it } from 'vitest';
import { drainInlineJobs } from '../src/jobs/queues.js';
import { SAMPLE_TEXT, signUp, type Session } from './helpers.js';

async function lessonWithRevision(s: Session) {
  const p = await s.agent.post('/api/v1/projects').set('x-csrf-token', s.csrf).send({ title: 'SIEM' });
  const src = await s.agent.post(`/api/v1/projects/${p.body.project._id}/sources/text`).set('x-csrf-token', s.csrf).send({ title: 'n', text: SAMPLE_TEXT });
  const gen = await s.agent.post(`/api/v1/projects/${p.body.project._id}/generations`).set('x-csrf-token', s.csrf).send({ sourceIds: [src.body.source._id], autoContinue: true }).expect(202);
  await drainInlineJobs();
  return (await s.agent.get(`/api/v1/generations/${gen.body.generation._id}`)).body.generation.lessonId as string;
}

describe('revision system (Phase 6 acceptance)', () => {
  it('schedules flashcards with spaced repetition', async () => {
    const s = await signUp();
    const lessonId = await lessonWithRevision(s);
    const cards = (await s.agent.get(`/api/v1/lessons/${lessonId}/flashcards`).expect(200)).body.flashcards;
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c: { back: string }) => c.back.length > 0)).toBe(true);

    const due = (await s.agent.get('/api/v1/flashcards?due=true').expect(200)).body.flashcards;
    expect(due.length).toBe(cards.length);

    const good = await s.agent.post(`/api/v1/flashcards/${cards[0]._id}/review`).set('x-csrf-token', s.csrf).send({ grade: 4 }).expect(200);
    expect(good.body.review.intervalDays).toBe(1);
    const forgot = await s.agent.post(`/api/v1/flashcards/${cards[1]._id}/review`).set('x-csrf-token', s.csrf).send({ grade: 0 }).expect(200);
    expect(forgot.body.review.lapses).toBe(1);
    await s.agent.post(`/api/v1/flashcards/${cards[0]._id}/review`).set('x-csrf-token', s.csrf).send({ grade: 9 }).expect(400);

    const dueAfter = (await s.agent.get('/api/v1/flashcards?due=true')).body.flashcards;
    expect(dueAfter.length).toBe(cards.length - 2);
    const revision = (await s.agent.get('/api/v1/revision/due').expect(200)).body;
    expect(revision.unseen).toBe(cards.length - 2);
    expect(revision.schedule.length).toBeGreaterThan(0);
  });

  it('hides answer keys until submission, then scores and explains', async () => {
    const s = await signUp();
    const lessonId = await lessonWithRevision(s);
    const [quiz] = (await s.agent.get(`/api/v1/lessons/${lessonId}/quizzes`).expect(200)).body.quizzes;
    expect(quiz.questions.length).toBeGreaterThan(2);
    for (const q of quiz.questions) {
      expect(q.correctOptionIndex).toBeUndefined();
      expect(q.answer).toBeUndefined();
      expect(q.explanation).toBeUndefined();
    }
    const types = new Set(quiz.questions.map((q: { type: string }) => q.type));
    expect(types.has('mcq') || types.has('true-false')).toBe(true);
    expect(types.has('short-answer')).toBe(true);
    expect(types.has('scenario')).toBe(true);

    // Answer everything wrongly except open questions answered with the lesson's own words.
    const answers = quiz.questions.map((q: { id: string; type: string; options: string[] }) =>
      q.type === 'mcq' || q.type === 'true-false' ? { questionId: q.id, selectedOptionIndex: 0 } : { questionId: q.id, text: 'Correlation rules raise alerts; the analyst gathers more evidence before concluding.' },
    );
    const res = await s.agent.post(`/api/v1/quizzes/${quiz._id}/attempts`).set('x-csrf-token', s.csrf).send({ answers }).expect(201);
    expect(res.body.attempt.maxScore).toBe(quiz.questions.length);
    expect(res.body.results.every((r: { feedback: string }) => r.feedback.length > 0)).toBe(true);
    expect(res.body.questions[0].explanation).toBeDefined();
    const scenario = res.body.results.find((r: { questionId: string }) => quiz.questions.find((q: { id: string; type: string }) => q.id === r.questionId)?.type === 'scenario');
    expect(scenario.score).toBeGreaterThan(0);

    await s.agent.post(`/api/v1/quizzes/${quiz._id}/attempts`).set('x-csrf-token', s.csrf).send({ answers: [{ questionId: 'nope', selectedOptionIndex: 0 }] }).expect(400);

    // Mistake review and bookmarks.
    await s.agent.post(`/api/v1/quizzes/${quiz._id}/bookmarks`).set('x-csrf-token', s.csrf).send({ questionId: quiz.questions[0].id, bookmarked: true }).expect(204);
    const review = (await s.agent.get('/api/v1/revision/review-questions').expect(200)).body;
    expect(review.bookmarked).toHaveLength(1);
    const wrong = res.body.results.filter((r: { correct: boolean }) => !r.correct).length;
    expect(review.mistakes).toHaveLength(wrong);

    // A second identical attempt makes those mistakes "repeated".
    await s.agent.post(`/api/v1/quizzes/${quiz._id}/attempts`).set('x-csrf-token', s.csrf).send({ answers }).expect(201);
    const summary = (await s.agent.get('/api/v1/progress/summary').expect(200)).body;
    expect(summary.totals.quizAttempts).toBe(2);
    expect(summary.quizHistory).toHaveLength(2);
    if (wrong) expect(summary.repeatedMistakes.length).toBeGreaterThan(0);
    const dash = (await s.agent.get('/api/v1/dashboard').expect(200)).body;
    expect(dash.stats.quizAverage).not.toBeNull();
    if (wrong) expect(dash.weakTopics.length).toBeGreaterThan(0);
  });

  it('only real activity counts as progress', async () => {
    const s = await signUp();
    const lessonId = await lessonWithRevision(s);
    const lesson = (await s.agent.get(`/api/v1/lessons/${lessonId}`)).body.lesson;
    const opened = (await s.agent.get(`/api/v1/lessons/${lessonId}/progress`)).body.progress;
    expect(opened.completionStatus).toBe('not_started');
    for (const section of lesson.sections.slice(0, -1)) {
      await s.agent.patch(`/api/v1/lessons/${lessonId}/progress`).set('x-csrf-token', s.csrf).send({ completedSectionId: section.id }).expect(200);
    }
    let p = (await s.agent.patch(`/api/v1/lessons/${lessonId}/progress`).set('x-csrf-token', s.csrf).send({ addTimeSeconds: 120 })).body.progress;
    expect(p.completionStatus).toBe('in_progress');
    p = (await s.agent.patch(`/api/v1/lessons/${lessonId}/progress`).set('x-csrf-token', s.csrf).send({ completedSectionId: lesson.sections.at(-1).id })).body.progress;
    expect(p.completionStatus).toBe('completed');
    const summary = (await s.agent.get('/api/v1/progress/summary')).body;
    expect(summary.totals.lessonsCompleted).toBe(1);
    expect(summary.totals.timeSpentSeconds).toBe(120);
    expect(summary.dailyStudy[0].minutes).toBe(2);
    expect(summary.totals.streak).toBe(1);
  });

  it('keeps revision data private', async () => {
    const owner = await signUp();
    const other = await signUp();
    const lessonId = await lessonWithRevision(owner);
    const [quiz] = (await owner.agent.get(`/api/v1/lessons/${lessonId}/quizzes`)).body.quizzes;
    await other.agent.get(`/api/v1/lessons/${lessonId}/flashcards`).expect(404);
    await other.agent.post(`/api/v1/quizzes/${quiz._id}/attempts`).set('x-csrf-token', other.csrf).send({ answers: [] }).expect(404);
    expect((await other.agent.get('/api/v1/flashcards')).body.flashcards).toHaveLength(0);
  });
});
