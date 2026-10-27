import {
  ContentAnalysisSchema,
  CRITICAL_STAGES,
  GENERATION_STAGES,
  GenerationPreferencesSchema,
  LessonSectionSchema,
  PresentationManifestSchema,
  QuestionSchema,
  type ContentAnalysis,
  type DiagramSpec,
  type GenerationEvent,
  type GenerationPreferences,
  type GenerationStage,
  type LessonSection,
  type PresentationManifest,
  type StageResult,
} from '@cyberlearn/shared';
import { analyzeContent, type ChunkInput } from '../ai/contentAnalyzer.js';
import { generateAssessment } from '../ai/assessmentGenerator.js';
import { generateSection, relevantChunks } from '../ai/lessonGenerator.js';
import { buildCaptions, generateNarration } from '../ai/narrationGenerator.js';
import { fallbackImageProvider, imageProvider, speechProvider } from '../ai/providers/index.js';
import { textProviderFor } from '../ai/providers/userProviders.js';
import { AiOutputError, AiProviderError, type AiUsage, type TextGenerationProvider } from '../ai/types.js';
import { generateDiagram, illustrationPrompt, planVisuals } from '../ai/visualPlanner.js';
import { publishGenerationEvent } from '../jobs/eventBus.js';
import {
  Asset,
  Flashcard,
  FlashcardReview,
  Generation,
  Lesson,
  LessonVersion,
  Presentation,
  PresentationVersion,
  Project,
  Quiz,
  Source,
  SourceChunk,
  User,
  type GenerationDoc,
} from '../models/index.js';
import { logger } from '../utils/logger.js';
import { recordActivity } from './activity.js';
import { storeAsset } from './assets.js';
import { assemblePresentation, syncSlideToNarration } from './presentationAssembler.js';
import { env } from '../config/env.js';

class CancelledError extends Error {}
class SkipStage extends Error {}

interface RunState {
  gen: GenerationDoc;
  ownerId: string;
  preferences: GenerationPreferences;
  chunks?: ChunkInput[];
  usage: AiUsage;
  /** The user's own AI provider from Settings, or the server default. */
  text: TextGenerationProvider;
}

export function toEvent(gen: GenerationDoc): GenerationEvent {
  return {
    generationId: String(gen._id),
    status: gen.status as GenerationEvent['status'],
    currentStage: (gen.currentStage ?? undefined) as GenerationStage | undefined,
    stageResults: gen.stageResults.map((s) => ({
      stage: s.stage,
      status: s.status,
      attempts: s.attempts,
      startedAt: s.startedAt ?? undefined,
      completedAt: s.completedAt ?? undefined,
      error: s.error ?? undefined,
      detail: s.detail ?? undefined,
    })),
    lessonId: gen.lessonId ? String(gen.lessonId) : undefined,
    errorMessage: gen.errorMessage || undefined,
  };
}

export function initialStageResults(): StageResult[] {
  return GENERATION_STAGES.map((stage) => ({ stage, status: 'pending', attempts: 0 }));
}

async function emit(gen: GenerationDoc) {
  await gen.save();
  await publishGenerationEvent(toEvent(gen));
}

function stageOf(gen: GenerationDoc, stage: GenerationStage) {
  return gen.stageResults.find((s) => s.stage === stage)!;
}

async function setDetail(state: RunState, stage: GenerationStage, detail: string) {
  stageOf(state.gen, stage).detail = detail;
  await emit(state.gen);
}

function addUsage(state: RunState, usage: AiUsage) {
  state.usage.calls += usage.calls;
  state.usage.inputChars += usage.inputChars;
  state.usage.outputChars += usage.outputChars;
}

async function checkCancelled(state: RunState) {
  const fresh = await Generation.findById(state.gen._id).select('cancelRequested').lean();
  if (fresh?.cancelRequested) throw new CancelledError();
}

/** Safe, user-facing error text (no stack traces or provider secrets). */
function safeError(err: unknown): string {
  if (err instanceof AiProviderError || err instanceof AiOutputError) return err.message;
  if (err instanceof Error && /^(No readable|Source|Analysis|Lesson|Nothing)/.test(err.message)) return err.message;
  return 'Unexpected error during this stage';
}

const isRetryable = (err: unknown) => (err instanceof AiProviderError && err.retryable) || err instanceof AiOutputError;
const backoffMs = (attempt: number) => (env.isTest ? 0 : Math.min(30_000, 2000 * 2 ** (attempt - 1)));

// ---------------------------------------------------------------- stage helpers

async function loadChunks(state: RunState): Promise<ChunkInput[]> {
  if (state.chunks) return state.chunks;
  const chunks = await SourceChunk.find({ ownerId: state.ownerId, sourceId: { $in: state.gen.sourceIds } })
    .sort({ sourceId: 1, index: 1 })
    .lean();
  // Chunk indexes restart per source, so renumber them globally for the AI.
  state.chunks = chunks.map((c, i) => ({ index: i, text: c.text, heading: c.heading, page: c.page, sourceId: String(c.sourceId) }));
  return state.chunks;
}

function analysisOf(state: RunState): ContentAnalysis {
  const parsed = ContentAnalysisSchema.safeParse(state.gen.analysis);
  if (!parsed.success) throw new Error('Analysis is missing or invalid; retry the analysis stage');
  return parsed.data;
}

async function lessonFor(state: RunState) {
  const lesson = await Lesson.findOne({ ownerId: state.ownerId, _id: state.gen.lessonId });
  if (!lesson) throw new Error('Lesson has not been created yet');
  return lesson;
}

// ---------------------------------------------------------------- stages

const STAGES: Record<GenerationStage, (state: RunState) => Promise<string | void>> = {
  async extract(state) {
    const sources = await Source.find({ ownerId: state.ownerId, _id: { $in: state.gen.sourceIds } }).lean();
    if (!sources.length) throw new Error('Source material was not found');
    const failed = sources.filter((s) => s.extractionStatus !== 'completed');
    if (failed.length === sources.length) throw new Error(`Source extraction failed: ${failed[0].extractionError || 'no text'}`);
    const chunks = await loadChunks(state);
    if (!chunks.length) throw new Error('No readable text was found in the selected sources');
    return `${chunks.length} chunks from ${sources.length} source${sources.length === 1 ? '' : 's'}`;
  },

  async analyze(state) {
    const project = await Project.findById(state.gen.projectId).lean();
    const { analysis, usage } = await analyzeContent(state.text, { chunks: await loadChunks(state), projectTitle: project?.title ?? 'Lesson', preferences: state.preferences });
    addUsage(state, usage);
    state.gen.analysis = analysis;
    await Project.updateOne({ _id: state.gen.projectId }, { $set: { subject: analysis.subject } });
    return `${analysis.sections.length} sections, ${analysis.visuals.length} proposed visuals`;
  },

  async lesson(state) {
    const analysis = analysisOf(state);
    const chunks = await loadChunks(state);
    const project = await Project.findById(state.gen.projectId);
    const planned = analysis.sections.filter((s) => s.include);
    if (!planned.length) throw new Error('Nothing to generate: every section was removed from the plan');

    let lesson = state.gen.lessonId ? await Lesson.findById(state.gen.lessonId) : null;
    if (!lesson && project?.lessonId) {
      // Regeneration keeps the same lesson id (and progress) but preserves the previous content as a version.
      lesson = await Lesson.findOne({ _id: project.lessonId, ownerId: state.ownerId });
      if (lesson) {
        const snapshot = lesson.toObject();
        await LessonVersion.create({ ownerId: state.ownerId, lessonId: lesson._id, version: lesson.version, snapshot, reason: 'regenerated' });
        lesson.set({ version: lesson.version + 1, sections: [], diagrams: [] });
      }
    }
    lesson ??= new Lesson({ ownerId: state.ownerId, projectId: state.gen.projectId, title: analysis.title });
    lesson.set({
      generationId: state.gen._id,
      sourceIds: state.gen.sourceIds,
      title: analysis.title,
      subject: analysis.subject,
      difficulty: state.preferences.difficulty,
      language: state.preferences.language,
      summary: analysis.summary,
      // Objectives that only concern a section the user removed are dropped with it.
      learningObjectives: analysis.learningObjectives.filter(
        (o) => !analysis.sections.some((s) => !s.include && o.toLowerCase().includes(s.title.toLowerCase())),
      ),
      keyTerms: analysis.keyTerms,
      prerequisites: analysis.prerequisites,
      conceptLinks: analysis.relationships,
      warnings: analysis.warnings,
      generationStatus: 'generating',
    });
    await lesson.save();
    state.gen.lessonId = lesson._id;
    if (project) {
      project.lessonId = lesson._id;
      await project.save();
    }

    // Sections already written in an earlier attempt are reused (partial-result recovery).
    const done = new Map(((lesson.sections ?? []) as LessonSection[]).map((s) => [s.id, s]));
    const sections: LessonSection[] = [];
    for (const [i, section] of planned.entries()) {
      await checkCancelled(state);
      const existing = done.get(section.id);
      if (existing) {
        sections.push(existing);
        continue;
      }
      await setDetail(state, 'lesson', `Writing section ${i + 1} of ${planned.length}: ${section.title}`);
      const { section: written, usage } = await generateSection(state.text, { section, chunks: relevantChunks(section, chunks), analysis, preferences: state.preferences });
      addUsage(state, usage);
      sections.push(LessonSectionSchema.parse(written));
      lesson.set({ sections: [...sections] });
      await lesson.save();
    }
    lesson.set({ sections });
    await lesson.save();
    return `${sections.length} sections written`;
  },

  async assessment(state) {
    if (!state.preferences.quizzes && !state.preferences.flashcards) throw new SkipStage();
    const lesson = await lessonFor(state);
    const chunks = await loadChunks(state);
    const { assessment, usage } = await generateAssessment(state.text, {
      title: lesson.title,
      sections: lesson.sections as LessonSection[],
      keyTerms: analysisOf(state).keyTerms,
      sourceText: chunks.map((c) => c.text).join('\n\n'),
      preferences: state.preferences,
    });
    addUsage(state, usage);
    const oldCards = await Flashcard.find({ ownerId: state.ownerId, lessonId: lesson._id }).select('_id').lean();
    await FlashcardReview.deleteMany({ ownerId: state.ownerId, flashcardId: { $in: oldCards.map((c) => c._id) } });
    await Flashcard.deleteMany({ ownerId: state.ownerId, lessonId: lesson._id });
    await Quiz.deleteMany({ ownerId: state.ownerId, lessonId: lesson._id });
    const refsBySection = new Map((lesson.sections as LessonSection[]).map((s) => [s.id, s.sourceRefs.slice(0, 3)]));
    if (assessment.flashcards.length) {
      await Flashcard.insertMany(
        assessment.flashcards.map((c) => ({ ...c, ownerId: state.ownerId, projectId: lesson.projectId, lessonId: lesson._id, sourceReferences: refsBySection.get(c.sectionId) ?? [] })),
      );
    }
    const questions = assessment.questions.filter((q) => QuestionSchema.safeParse(q).success);
    if (questions.length) {
      await Quiz.create({
        ownerId: state.ownerId,
        projectId: lesson.projectId,
        lessonId: lesson._id,
        title: `${lesson.title} — quiz`,
        questions,
        difficulty: state.preferences.difficulty,
        sourceReferences: [...refsBySection.values()].flat().slice(0, 30),
      });
    }
    return `${assessment.flashcards.length} flashcards, ${questions.length} questions`;
  },

  async diagrams(state) {
    const analysis = analysisOf(state);
    const plan = planVisuals(analysis, state.preferences);
    if (!plan.diagrams.length) throw new SkipStage();
    const lesson = await lessonFor(state);
    const sections = lesson.sections as LessonSection[];
    const chunks = await loadChunks(state);
    const existing = (lesson.diagrams ?? []) as DiagramSpec[];
    const diagrams: DiagramSpec[] = [...existing];
    const problems: string[] = [];
    for (const [i, visual] of plan.diagrams.entries()) {
      await checkCancelled(state);
      if (existing.some((d) => d.id.endsWith(visual.id) && d.sectionId === visual.sectionId)) continue;
      const section = sections.find((s) => s.id === visual.sectionId);
      if (!section) continue;
      await setDetail(state, 'diagrams', `Diagram ${i + 1} of ${plan.diagrams.length}: ${section.title}`);
      try {
        const planned = analysis.sections.find((s) => s.id === section.id);
        const { diagram, usage } = await generateDiagram(state.text, {
          visual,
          section,
          chunks: planned ? relevantChunks(planned, chunks) : chunks.slice(0, 3),
          keyTerms: analysis.keyTerms,
        });
        addUsage(state, usage);
        diagrams.push(diagram);
      } catch (err) {
        if (err instanceof CancelledError) throw err;
        problems.push(`${section.title}: ${safeError(err)}`);
        logger.warn({ err, visual: visual.id }, 'Diagram rejected');
      }
    }
    lesson.set({ diagrams });
    await lesson.save();
    if (!diagrams.length && problems.length) throw new Error(`No diagram passed validation (${problems[0]})`);
    return `${diagrams.length} diagrams${problems.length ? `, ${problems.length} rejected by validation` : ''}`;
  },

  async images(state) {
    const analysis = analysisOf(state);
    const plan = planVisuals(analysis, state.preferences);
    if (!plan.illustrations.length) throw new SkipStage();
    const lesson = await lessonFor(state);
    const sections = lesson.sections as LessonSection[];
    let fallbacks = 0;
    let created = 0;
    for (const [i, visual] of plan.illustrations.entries()) {
      await checkCancelled(state);
      const section = sections.find((s) => s.id === visual.sectionId);
      const prompt = illustrationPrompt(visual, section, analysis.subject);
      const topic = visual.id === 'cover-illustration' ? 'cover' : visual.sectionId;
      // Do not regenerate an identical image the lesson already has (spec 5.5).
      const reusable = await Asset.findOne({ ownerId: state.ownerId, lessonId: lesson._id, assetType: 'image', status: 'ready', 'generationMetadata.prompt': prompt });
      if (reusable) continue;
      await setDetail(state, 'images', `Illustration ${i + 1} of ${plan.illustrations.length}`);
      const metadata = { prompt, topic, sectionId: visual.sectionId, provider: imageProvider().name, model: imageProvider().model, fallback: false };
      const old = await Asset.find({ ownerId: state.ownerId, lessonId: lesson._id, assetType: 'image', 'generationMetadata.topic': topic });
      const target = old[0];
      try {
        const img = await imageProvider().generateImage({ prompt, title: section?.title ?? analysis.title, concepts: section?.keyConcepts ?? [], aspectRatio: '16:9' });
        await storeAsset({ assetId: target ? String(target._id) : undefined, ownerId: state.ownerId, projectId: lesson.projectId, lessonId: lesson._id, assetType: 'image', body: img.body, mimeType: img.mimeType, filename: `${topic}.${img.mimeType.includes('svg') ? 'svg' : 'png'}`, metadata });
      } catch (err) {
        // A failed illustration never destroys the lesson: store a placeholder the user can retry (spec 3.1).
        logger.warn({ err }, 'Image generation failed, using placeholder');
        const img = await fallbackImageProvider.generateImage({ prompt, title: section?.title ?? analysis.title, concepts: section?.keyConcepts ?? [] });
        await storeAsset({
          assetId: target ? String(target._id) : undefined,
          ownerId: state.ownerId,
          projectId: lesson.projectId,
          lessonId: lesson._id,
          assetType: 'image',
          body: img.body,
          mimeType: img.mimeType,
          filename: `${topic}.svg`,
          metadata: { ...metadata, provider: fallbackImageProvider.name, model: fallbackImageProvider.model, fallback: true },
        });
        fallbacks += 1;
      }
      created += 1;
    }
    return `${created} illustrations${fallbacks ? ` (${fallbacks} placeholder${fallbacks === 1 ? '' : 's'} after provider errors — regenerate them from the gallery)` : ''}`;
  },

  async presentation(state) {
    const analysis = analysisOf(state);
    const lesson = await lessonFor(state);
    const images = await Asset.find({ ownerId: state.ownerId, lessonId: lesson._id, assetType: 'image', status: 'ready' }).lean();
    const imageMap: Record<string, string> = {};
    for (const img of images) imageMap[img.generationMetadata?.topic || img.generationMetadata?.sectionId || ''] = String(img._id);
    const existing = await Presentation.findOne({ ownerId: state.ownerId, lessonId: lesson._id });
    const version = existing ? existing.version + 1 : 1;
    const manifest = assemblePresentation({
      title: lesson.title,
      summary: lesson.summary,
      learningObjectives: lesson.learningObjectives,
      sections: lesson.sections as LessonSection[],
      diagrams: lesson.diagrams as DiagramSpec[],
      layouts: planVisuals(analysis, state.preferences).layouts,
      images: imageMap,
      preferences: state.preferences,
      language: state.preferences.language,
      version,
    });
    if (existing) {
      await PresentationVersion.create({ ownerId: state.ownerId, presentationId: existing._id, version: existing.version, label: 'Before regeneration', manifest: existing.manifest });
      existing.set({ manifest, version, title: lesson.title, status: 'ready' });
      await existing.save();
      state.gen.presentationId = existing._id;
    } else {
      const created = await Presentation.create({ ownerId: state.ownerId, projectId: lesson.projectId, lessonId: lesson._id, title: lesson.title, manifest, version, status: 'ready' });
      state.gen.presentationId = created._id;
    }
    return `${manifest.slides.length} slides`;
  },

  async narration(state) {
    if (!state.preferences.narration) throw new SkipStage();
    const lesson = await lessonFor(state);
    const presentation = await Presentation.findOne({ ownerId: state.ownerId, lessonId: lesson._id });
    if (!presentation) throw new Error('Presentation is missing; retry the presentation stage');
    const manifest = presentation.manifest as PresentationManifest;
    const diagrams = new Map(manifest.diagrams.map((d) => [d.id, d]));
    const diagramLabels: Record<string, string[]> = {};
    for (const s of manifest.slides) {
      const d = s.diagramId ? diagrams.get(s.diagramId) : undefined;
      if (d) diagramLabels[s.id] = (d.steps.length ? d.steps : d.nodes.map((n) => n.id)).map((id) => d.nodes.find((n) => n.id === id)?.label ?? id);
    }
    const { texts, usage } = await generateNarration(state.text, { lessonTitle: lesson.title, slides: manifest.slides, diagramLabels, preferences: state.preferences });
    addUsage(state, usage);

    const speech = speechProvider();
    let audioFailures = 0;
    const slides = [];
    for (const [i, slide] of manifest.slides.entries()) {
      await checkCancelled(state);
      const text = texts.get(slide.id) ?? '';
      if (!text) {
        slides.push(slide);
        continue;
      }
      const { captions, endMs } = buildCaptions(text);
      let synced = syncSlideToNarration(slide, slide.diagramId ? diagrams.get(slide.diagramId) : undefined, text, captions, endMs);
      if (speech.producesAudio) {
        await setDetail(state, 'narration', `Synthesizing audio ${i + 1} of ${manifest.slides.length}`);
        try {
          const audio = await speech.synthesize({ text, language: state.preferences.language });
          if (audio) {
            const asset = await storeAsset({
              ownerId: state.ownerId,
              projectId: lesson.projectId,
              lessonId: lesson._id,
              assetType: 'audio',
              body: audio.body,
              mimeType: audio.mimeType,
              filename: `${slide.id}.mp3`,
              metadata: { provider: speech.name, slideIds: [slide.id], topic: slide.title },
            });
            synced = { ...synced, narration: { ...synced.narration, audioAssetId: String(asset._id) } };
          }
        } catch (err) {
          audioFailures += 1;
          logger.warn({ err }, 'Speech synthesis failed; browser speech will be used for this slide');
        }
      }
      slides.push(synced);
    }
    const next = PresentationManifestSchema.parse({ ...manifest, slides });
    presentation.set({ manifest: next });
    presentation.markModified('manifest');
    await presentation.save();
    return speech.producesAudio
      ? `Narration for ${texts.size} slides${audioFailures ? `, ${audioFailures} audio clips fell back to browser speech` : ''}`
      : `Narration and captions for ${texts.size} slides (spoken by the browser)`;
  },

  async finalize(state) {
    const lesson = await lessonFor(state);
    const failed = state.gen.stageResults.filter((s) => s.status === 'failed').map((s) => s.stage);
    const mediaFailed = failed.some((s) => ['diagrams', 'images', 'narration'].includes(s));
    lesson.set({ generationStatus: failed.length ? 'partial' : 'ready' });
    await lesson.save();
    await Project.updateOne(
      { _id: state.gen.projectId },
      { $set: { 'status.content': 'ready', 'status.media': mediaFailed ? 'partial' : 'ready', lessonId: lesson._id } },
    );
    return failed.length ? `Saved with ${failed.length} stage(s) needing a retry` : 'Saved';
  },
};

// ---------------------------------------------------------------- runner

/**
 * Runs (or resumes) a generation. Completed stages are skipped, so the same job
 * can be retried safely after a crash or a partial failure (spec 12).
 */
export async function runGeneration(generationId: string): Promise<void> {
  const gen = (await Generation.findById(generationId)) as GenerationDoc | null;
  if (!gen || ['completed', 'cancelled'].includes(gen.status)) return;
  if (gen.cancelRequested) {
    gen.status = 'cancelled';
    await emit(gen);
    return;
  }
  let text: TextGenerationProvider;
  try {
    text = await textProviderFor(String(gen.ownerId));
  } catch (err) {
    gen.status = 'failed';
    gen.errorMessage = safeError(err);
    await emit(gen);
    return;
  }
  const state: RunState = {
    gen,
    ownerId: String(gen.ownerId),
    preferences: GenerationPreferencesSchema.parse(gen.preferences ?? {}),
    usage: { calls: 0, inputChars: 0, outputChars: 0 },
    text,
  };
  gen.status = 'running';
  gen.attemptCount += 1;
  gen.startedAt ??= new Date();
  gen.errorMessage = '';
  await Project.updateOne({ _id: gen.projectId }, { $set: { 'status.content': 'generating', 'status.media': 'generating' } });
  await emit(gen);

  try {
    for (const stage of GENERATION_STAGES) {
      const result = stageOf(gen, stage);
      if (result.status === 'completed' || result.status === 'skipped') continue;
      await checkCancelled(state);

      gen.currentStage = stage;
      let attempt = 0;
      for (;;) {
        attempt += 1;
        result.status = 'running';
        result.attempts += 1;
        result.startedAt = new Date().toISOString();
        result.error = undefined;
        await emit(gen);
        try {
          const detail = await STAGES[stage](state);
          result.status = 'completed';
          result.detail = detail || undefined;
          break;
        } catch (err) {
          if (err instanceof CancelledError) throw err;
          if (err instanceof SkipStage) {
            result.status = 'skipped';
            result.detail = 'Not requested';
            break;
          }
          if (isRetryable(err) && attempt < 3) {
            logger.warn({ err, stage, attempt }, 'Stage failed, retrying');
            await new Promise((r) => setTimeout(r, backoffMs(attempt)));
            continue;
          }
          logger.error({ err, stage, generationId }, 'Generation stage failed');
          result.status = 'failed';
          result.error = safeError(err);
          break;
        }
      }
      result.completedAt = new Date().toISOString();
      await emit(gen);

      if (result.status === 'failed' && CRITICAL_STAGES.includes(stage)) {
        gen.status = 'failed';
        gen.errorCode = `STAGE_${stage.toUpperCase()}_FAILED`;
        gen.errorMessage = result.error ?? 'Generation failed';
        gen.currentStage = null;
        await Project.updateOne({ _id: gen.projectId }, { $set: { 'status.content': gen.lessonId ? 'ready' : 'failed', 'status.media': 'failed' } });
        await emit(gen);
        return;
      }

      // Pause for the plan review screen (Screen 3) before expensive generation.
      if (stage === 'analyze' && !gen.autoContinue) {
        gen.status = 'awaiting_review';
        gen.currentStage = null;
        await Project.updateOne({ _id: gen.projectId }, { $set: { 'status.content': 'awaiting_review', 'status.media': 'none' } });
        await emit(gen);
        return;
      }
    }

    const anyFailed = gen.stageResults.some((s) => s.status === 'failed');
    gen.status = anyFailed ? 'partially_completed' : 'completed';
    gen.currentStage = null;
    gen.completedAt = new Date();
    await emit(gen);
    await recordActivity({ ownerId: state.ownerId, type: 'generation_finished', projectId: gen.projectId, lessonId: gen.lessonId, detail: gen.status });
  } catch (err) {
    if (err instanceof CancelledError) {
      for (const s of gen.stageResults) if (s.status === 'running') s.status = 'pending';
      gen.status = 'cancelled';
      gen.currentStage = null;
      await Project.updateOne({ _id: gen.projectId }, { $set: { 'status.content': gen.lessonId ? 'ready' : 'source_added', 'status.media': 'none' } });
      await emit(gen);
      return;
    }
    logger.error({ err, generationId }, 'Generation crashed');
    gen.status = 'failed';
    gen.errorMessage = 'Unexpected error; you can retry the failed stage';
    await emit(gen);
    throw err;
  } finally {
    // Usage and cost tracking (spec 12).
    gen.usage = {
      aiCalls: (gen.usage?.aiCalls ?? 0) + state.usage.calls,
      inputChars: (gen.usage?.inputChars ?? 0) + state.usage.inputChars,
      outputChars: (gen.usage?.outputChars ?? 0) + state.usage.outputChars,
    };
    await gen.save().catch(() => undefined);
    await User.updateOne(
      { _id: state.ownerId },
      { $inc: { 'usage.aiCalls': state.usage.calls, 'usage.inputChars': state.usage.inputChars, 'usage.outputChars': state.usage.outputChars } },
    );
  }
}

/** Stages whose output depends on earlier stages and must be rebuilt after a retry. */
const DOWNSTREAM: GenerationStage[] = ['presentation', 'narration', 'finalize'];

/** Resets failed stages (or one chosen stage) plus the stages that assemble their output. */
export function resetForRetry(gen: GenerationDoc, stage?: GenerationStage): boolean {
  const targets = stage ? [stage] : gen.stageResults.filter((s) => s.status === 'failed').map((s) => s.stage);
  if (!targets.length) return false;
  const firstIndex = Math.min(...targets.map((t) => GENERATION_STAGES.indexOf(t)));
  for (const s of gen.stageResults) {
    const idx = GENERATION_STAGES.indexOf(s.stage);
    if (targets.includes(s.stage) || (idx > firstIndex && DOWNSTREAM.includes(s.stage)) || (idx > firstIndex && s.status === 'pending')) {
      s.status = 'pending';
      s.error = undefined;
      s.detail = undefined;
    }
  }
  return true;
}
