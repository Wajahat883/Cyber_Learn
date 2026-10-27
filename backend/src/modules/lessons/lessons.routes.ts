import { Router } from 'express';
import {
  DiagramSpecSchema,
  GenerationPreferencesSchema,
  LessonSectionSchema,
  PresentationManifestSchema,
  slideElementIds,
  UpdateLessonSchema,
  type DiagramSpec,
  type LessonSection,
  type PresentationManifest,
} from '@cyberlearn/shared';
import { generateExamples, generateSection, relevantChunks } from '../../ai/lessonGenerator.js';
import { textProvider } from '../../ai/providers/index.js';
import { AiOutputError, AiProviderError } from '../../ai/types.js';
import { findOwned } from '../../middleware/authorize.js';
import { aiLimiter } from '../../middleware/rateLimit.js';
import { validate, validateIds } from '../../middleware/validate.js';
import { Generation, Lesson, LessonVersion, Presentation, Project, type LessonDoc } from '../../models/index.js';
import { recordActivity } from '../../services/activity.js';
import { loadChunks } from '../../services/chunks.js';
import { AppError, badRequest, notFound } from '../../utils/errors.js';
import { param, userId } from '../../utils/http.js';

export const lessonsRouter = Router();

const VERSION_INTERVAL_MS = 10 * 60 * 1000;

/** Preserves the current content before a change, at most every 10 minutes while autosaving. */
async function snapshot(lesson: LessonDoc, reason: string, force = false) {
  const latest = await LessonVersion.findOne({ lessonId: lesson._id }).sort({ version: -1 }).select('createdAt version').lean();
  if (!force && latest && Date.now() - new Date(latest.createdAt as Date).getTime() < VERSION_INTERVAL_MS && latest.version === lesson.version - 1) return false;
  await LessonVersion.create({ ownerId: lesson.ownerId, lessonId: lesson._id, version: lesson.version, snapshot: lesson.toObject(), reason });
  lesson.version += 1;
  return true;
}

function aiError(err: unknown): never {
  if (err instanceof AiProviderError) throw new AppError(err.retryable ? 503 : 502, err.code, err.message);
  if (err instanceof AiOutputError) throw new AppError(502, 'AI_OUTPUT_INVALID', err.message);
  throw err;
}

lessonsRouter.get('/lessons', async (req, res) => {
  const ownerId = userId(req);
  const lessons = await Lesson.find({ ownerId }).sort({ updatedAt: -1 }).limit(200).select('title subject projectId generationStatus updatedAt sections.id diagrams.id').lean();
  const presentations = await Presentation.find({ ownerId }).select('lessonId _id version manifest.slides.id').lean();
  const byLesson = new Map(presentations.map((p) => [String(p.lessonId), p]));
  res.json({
    lessons: lessons.map((l) => {
      const p = byLesson.get(String(l._id));
      return {
        _id: l._id,
        title: l.title,
        subject: l.subject,
        projectId: l.projectId,
        generationStatus: l.generationStatus,
        updatedAt: l.updatedAt,
        sectionCount: (l.sections as unknown[]).length,
        diagramCount: (l.diagrams as unknown[]).length,
        presentation: p ? { _id: p._id, version: p.version, slideCount: (p.manifest as PresentationManifest).slides.length } : null,
      };
    }),
  });
});

lessonsRouter.get('/lessons/:id', validateIds('id'), async (req, res) => {
  const lesson = await findOwned(Lesson, param(req, 'id'), userId(req), 'Lesson');
  res.json({ lesson });
});

lessonsRouter.patch('/lessons/:id', validateIds('id'), validate(UpdateLessonSchema), async (req, res) => {
  const ownerId = userId(req);
  const lesson = (await findOwned(Lesson, param(req, 'id'), ownerId, 'Lesson')) as LessonDoc;
  const { sections, ...rest } = req.body as { sections?: LessonSection[]; title?: string; learningObjectives?: string[] };
  if (sections) {
    const ids = sections.map((s) => s.id);
    if (new Set(ids).size !== ids.length) throw badRequest('Section ids must be unique');
  }
  const versioned = await snapshot(lesson, 'edit');
  lesson.set({ ...rest, ...(sections ? { sections } : {}) });
  await lesson.save();
  if (rest.title) await Project.updateOne({ _id: lesson.projectId, ownerId }, { $set: { title: rest.title } });
  if (versioned) await recordActivity({ ownerId, type: 'lesson_edited', projectId: lesson.projectId, lessonId: lesson._id });
  res.json({ lesson });
});

lessonsRouter.get('/lessons/:id/versions', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const lesson = await findOwned(Lesson, param(req, 'id'), ownerId, 'Lesson');
  const versions = await LessonVersion.find({ ownerId, lessonId: lesson._id }).sort({ version: -1 }).select('version reason createdAt snapshot.title').limit(100).lean();
  res.json({ versions });
});

lessonsRouter.get('/lessons/:id/versions/:version', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const lesson = await findOwned(Lesson, param(req, 'id'), ownerId, 'Lesson');
  const version = await LessonVersion.findOne({ ownerId, lessonId: lesson._id, version: Number(req.params.version) }).lean();
  if (!version) throw notFound('Version');
  res.json({ version });
});

lessonsRouter.post('/lessons/:id/versions/:version/restore', validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const lesson = (await findOwned(Lesson, param(req, 'id'), ownerId, 'Lesson')) as LessonDoc;
  const version = await LessonVersion.findOne({ ownerId, lessonId: lesson._id, version: Number(req.params.version) }).lean();
  if (!version) throw notFound('Version');
  const snap = version.snapshot as Partial<LessonDoc>;
  await snapshot(lesson, `before restoring v${version.version}`, true);
  lesson.set({ title: snap.title, summary: snap.summary, learningObjectives: snap.learningObjectives, sections: snap.sections, diagrams: snap.diagrams, keyTerms: snap.keyTerms });
  await lesson.save();
  res.json({ lesson });
});

async function sectionContext(lesson: LessonDoc, sectionId: string) {
  const section = (lesson.sections as LessonSection[]).find((s) => s.id === sectionId);
  if (!section) throw notFound('Section');
  const chunks = await loadChunks(String(lesson.ownerId), lesson.sourceIds);
  const gen = lesson.generationId ? await Generation.findById(lesson.generationId).select('preferences analysis').lean() : null;
  const preferences = GenerationPreferencesSchema.parse({ ...(gen?.preferences ?? {}), language: lesson.language, difficulty: lesson.difficulty });
  const planned = {
    id: section.id,
    title: section.title,
    concepts: section.keyConcepts,
    sourceChunks: [...new Set(section.sourceRefs.map((r) => r.chunkIndex))],
    include: true,
  };
  return { section, chunks: relevantChunks(planned, chunks), planned, preferences, analysis: gen?.analysis };
}

/** Regenerates one section; the previous lesson is kept in version history (spec 16 "Human review"). */
lessonsRouter.post('/lessons/:id/sections/:sectionId/regenerate', aiLimiter, validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const lesson = (await findOwned(Lesson, param(req, 'id'), ownerId, 'Lesson')) as LessonDoc;
  const ctx = await sectionContext(lesson, param(req, 'sectionId'));
  if (!ctx.chunks.length) throw badRequest('The source material for this section is no longer available');
  const analysis = ctx.analysis ?? { title: lesson.title, sections: (lesson.sections as LessonSection[]).map((s) => ({ ...s, concepts: s.keyConcepts })) };
  let written: LessonSection;
  try {
    ({ section: written } = await generateSection(textProvider(), { section: ctx.planned, chunks: ctx.chunks, analysis: analysis as never, preferences: ctx.preferences }));
  } catch (err) {
    aiError(err);
  }
  await snapshot(lesson, `before regenerating "${ctx.section.title}"`, true);
  lesson.set({ sections: (lesson.sections as LessonSection[]).map((s) => (s.id === ctx.section.id ? LessonSectionSchema.parse(written) : s)) });
  await lesson.save();
  res.json({ lesson });
});

lessonsRouter.post('/lessons/:id/sections/:sectionId/examples', aiLimiter, validateIds('id'), async (req, res) => {
  const ownerId = userId(req);
  const lesson = (await findOwned(Lesson, param(req, 'id'), ownerId, 'Lesson')) as LessonDoc;
  const ctx = await sectionContext(lesson, param(req, 'sectionId'));
  let examples;
  try {
    ({
      data: { examples },
    } = await generateExamples(textProvider(), { section: ctx.section, chunks: ctx.chunks, preferences: ctx.preferences }));
  } catch (err) {
    aiError(err);
  }
  const markdown = examples.map((e) => `**${e.title}**${e.supplementary ? ' _(supplementary)_' : ''}\n\n${e.body}`).join('\n\n');
  await snapshot(lesson, 'edit');
  lesson.set({
    sections: (lesson.sections as LessonSection[]).map((s) =>
      s.id === ctx.section.id ? { ...s, example: `${s.example ? `${s.example}\n\n` : ''}### Additional examples\n\n${markdown}`.slice(0, 6000) } : s,
    ),
  });
  await lesson.save();
  res.json({ lesson, examples });
});

/** Edit a diagram (labels, nodes, edges). The presentation copy is updated and its events re-validated. */
lessonsRouter.patch('/lessons/:id/diagrams/:diagramId', validateIds('id'), validate(DiagramSpecSchema), async (req, res) => {
  const ownerId = userId(req);
  const lesson = (await findOwned(Lesson, param(req, 'id'), ownerId, 'Lesson')) as LessonDoc;
  const diagramId = param(req, 'diagramId');
  const diagrams = lesson.diagrams as DiagramSpec[];
  if (!diagrams.some((d) => d.id === diagramId)) throw notFound('Diagram');
  const updated: DiagramSpec = { ...(req.body as DiagramSpec), id: diagramId };
  await snapshot(lesson, 'edit');
  lesson.set({ diagrams: diagrams.map((d) => (d.id === diagramId ? updated : d)) });
  await lesson.save();

  const presentation = await Presentation.findOne({ ownerId, lessonId: lesson._id });
  if (presentation) {
    const manifest = presentation.manifest as PresentationManifest;
    const next = {
      ...manifest,
      diagrams: manifest.diagrams.map((d) => (d.id === diagramId ? updated : d)),
      slides: manifest.slides.map((s) => {
        if (s.diagramId !== diagramId) return s;
        const ids = slideElementIds(s, updated);
        const edges = new Set(updated.edges.map((e) => e.id));
        return { ...s, events: s.events.filter((e) => ids.has(e.targetId) && (e.type !== 'moveAlongPath' || (e.pathId && edges.has(e.pathId)))) };
      }),
    };
    presentation.set({ manifest: PresentationManifestSchema.parse(next) });
    presentation.markModified('manifest');
    await presentation.save();
  }
  res.json({ lesson });
});
