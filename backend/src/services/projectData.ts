import { Types } from 'mongoose';
import { storage } from '../config/storage.js';
import {
  Activity,
  Asset,
  Flashcard,
  FlashcardReview,
  Generation,
  Lesson,
  LessonVersion,
  Presentation,
  PresentationVersion,
  Progress,
  Project,
  Quiz,
  QuizAttempt,
  Source,
  SourceChunk,
} from '../models/index.js';
import { logger } from '../utils/logger.js';

async function deleteStorageKeys(keys: string[]) {
  for (const key of keys.filter(Boolean)) {
    await storage.delete(key).catch((err) => logger.warn({ err, key }, 'Failed to delete stored object'));
  }
}

/** Deletes a project and every document and stored file derived from it (spec 15 deletion policy). */
export async function deleteProjectData(ownerId: string, projectId: string) {
  const filter = { ownerId, projectId };
  // Stop running pipelines first: they check this flag (and the project's existence)
  // between stages and sections, and clean up anything they wrote after the delete.
  await Generation.updateMany({ ...filter, status: { $in: ['queued', 'running', 'awaiting_review'] } }, { $set: { cancelRequested: true } });
  const lessons = await Lesson.find(filter).select('_id').lean();
  const lessonIds = lessons.map((l) => l._id);
  const presentations = await Presentation.find(filter).select('_id').lean();
  const assets = await Asset.find(filter).select('+storageKey').lean();
  const sources = await Source.find(filter).select('storageKey').lean();
  const quizzes = await Quiz.find(filter).select('_id').lean();
  const flashcards = await Flashcard.find(filter).select('_id').lean();

  await deleteStorageKeys([...assets.map((a) => a.storageKey), ...sources.map((s) => s.storageKey)]);

  await Promise.all([
    SourceChunk.deleteMany(filter),
    Source.deleteMany(filter),
    Generation.deleteMany(filter),
    LessonVersion.deleteMany({ ownerId, lessonId: { $in: lessonIds } }),
    Lesson.deleteMany(filter),
    PresentationVersion.deleteMany({ ownerId, presentationId: { $in: presentations.map((p) => p._id) } }),
    Presentation.deleteMany(filter),
    Asset.deleteMany(filter),
    FlashcardReview.deleteMany({ ownerId, flashcardId: { $in: flashcards.map((f) => f._id) } }),
    Flashcard.deleteMany(filter),
    QuizAttempt.deleteMany({ ownerId, quizId: { $in: quizzes.map((q) => q._id) } }),
    Quiz.deleteMany(filter),
    Progress.deleteMany(filter),
    Activity.deleteMany(filter),
  ]);
  await Project.deleteOne({ _id: projectId, ownerId });
}

function newKey(oldKey: string, projectId: string) {
  const name = oldKey.split('/').pop() ?? 'file';
  return `users/${oldKey.split('/')[1]}/projects/${projectId}/${new Types.ObjectId()}-${name}`;
}

/**
 * Copies a project with its sources, lesson, presentation and revision material.
 * Stored files are copied too, so deleting one copy never breaks the other.
 * Study progress is intentionally not copied.
 */
export async function duplicateProject(ownerId: string, projectId: string) {
  const original = await Project.findOne({ _id: projectId, ownerId }).lean();
  if (!original) return null;
  const { _id, createdAt: _c, updatedAt: _u, ...rest } = original;
  const copy = await Project.create({ ...rest, title: `${original.title} (copy)`.slice(0, 200), favorite: false, lastStudiedAt: null, lessonId: null });
  const newProjectId = String(copy._id);

  const sourceMap = new Map<string, Types.ObjectId>();
  for (const source of await Source.find({ ownerId, projectId }).lean()) {
    const { _id: oldId, createdAt: _sc, updatedAt: _su, ...s } = source;
    const storageKey = s.storageKey ? newKey(s.storageKey, newProjectId) : '';
    if (s.storageKey) await storage.copy(s.storageKey, storageKey);
    const created = await Source.create({ ...s, projectId: copy._id, storageKey });
    sourceMap.set(String(oldId), created._id);
    const chunks = await SourceChunk.find({ sourceId: oldId }).lean();
    if (chunks.length) {
      await SourceChunk.insertMany(chunks.map(({ _id: _x, ...c }) => ({ ...c, projectId: copy._id, sourceId: created._id })));
    }
  }

  const assetMap = new Map<string, Types.ObjectId>();
  for (const asset of await Asset.find({ ownerId, projectId, assetType: { $in: ['image', 'audio'] } }).select('+storageKey').lean()) {
    const { _id: oldId, createdAt: _ac, updatedAt: _au, ...a } = asset;
    const storageKey = a.storageKey ? newKey(a.storageKey, newProjectId) : '';
    if (a.storageKey) await storage.copy(a.storageKey, storageKey);
    const created = await Asset.create({ ...a, projectId: copy._id, storageKey, lessonId: null });
    assetMap.set(String(oldId), created._id);
  }

  const lesson = original.lessonId ? await Lesson.findOne({ _id: original.lessonId, ownerId }).select('+searchText').lean() : null;
  if (lesson) {
    const { _id: oldLessonId, createdAt: _lc, updatedAt: _lu, ...l } = lesson;
    const newLesson = await Lesson.create({
      ...l,
      projectId: copy._id,
      generationId: null,
      sourceIds: l.sourceIds.map((id) => sourceMap.get(String(id)) ?? id),
      sections: (l.sections as { sourceRefs?: { sourceId?: string }[] }[]).map((section) => ({
        ...section,
        sourceRefs: (section.sourceRefs ?? []).map((r) => ({ ...r, sourceId: r.sourceId ? String(sourceMap.get(r.sourceId) ?? r.sourceId) : r.sourceId })),
      })),
    });
    await Asset.updateMany({ _id: { $in: [...assetMap.values()] } }, { $set: { lessonId: newLesson._id } });

    const presentation = await Presentation.findOne({ ownerId, lessonId: oldLessonId }).lean();
    if (presentation) {
      const manifest = JSON.parse(JSON.stringify(presentation.manifest)) as { slides: { imageAssetId?: string; narration?: { audioAssetId?: string } }[] };
      for (const slide of manifest.slides) {
        if (slide.imageAssetId) slide.imageAssetId = String(assetMap.get(slide.imageAssetId) ?? slide.imageAssetId);
        if (slide.narration?.audioAssetId) slide.narration.audioAssetId = String(assetMap.get(slide.narration.audioAssetId) ?? slide.narration.audioAssetId);
      }
      const { _id: _p, createdAt: _pc, updatedAt: _pu, ...p } = presentation;
      await Presentation.create({ ...p, manifest, projectId: copy._id, lessonId: newLesson._id, version: 1 });
    }

    const flashcards = await Flashcard.find({ ownerId, lessonId: oldLessonId }).lean();
    if (flashcards.length) {
      await Flashcard.insertMany(flashcards.map(({ _id: _f, createdAt: _fc, updatedAt: _fu, ...f }) => ({ ...f, projectId: copy._id, lessonId: newLesson._id })));
    }
    const quizzes = await Quiz.find({ ownerId, lessonId: oldLessonId }).lean();
    if (quizzes.length) {
      await Quiz.insertMany(quizzes.map(({ _id: _q, createdAt: _qc, updatedAt: _qu, ...q }) => ({ ...q, projectId: copy._id, lessonId: newLesson._id })));
    }
    copy.lessonId = newLesson._id;
    await copy.save();
  }
  return copy;
}
