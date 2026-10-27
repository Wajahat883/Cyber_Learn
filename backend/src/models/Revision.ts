import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import type { Question } from '@cyberlearn/shared';

const flashcardSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },
    conceptId: { type: String, default: '' },
    sectionId: { type: String, default: '' },
    front: { type: String, required: true, maxlength: 500 },
    back: { type: String, required: true, maxlength: 1500 },
    explanation: { type: String, default: '' },
    sourceReferences: { type: [Schema.Types.Mixed], default: [] },
    difficulty: { type: String, default: 'intermediate' },
  },
  { timestamps: true },
);

flashcardSchema.index({ ownerId: 1, lessonId: 1 });

export const Flashcard = model('Flashcard', flashcardSchema);

/** Per-user review state kept apart from card content (spec 8.8) — also the revision schedule. */
const flashcardReviewSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    flashcardId: { type: Schema.Types.ObjectId, ref: 'Flashcard', required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },
    repetitions: { type: Number, default: 0 },
    intervalDays: { type: Number, default: 0 },
    easeFactor: { type: Number, default: 2.5 },
    nextReviewAt: { type: Date, required: true },
    lastGrade: { type: Number, default: null },
    reviewCount: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    lapses: { type: Number, default: 0 },
    lastReviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

flashcardReviewSchema.index({ ownerId: 1, flashcardId: 1 }, { unique: true });
flashcardReviewSchema.index({ ownerId: 1, nextReviewAt: 1 });

export const FlashcardReview = model('FlashcardReview', flashcardReviewSchema);

const quizSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },
    title: { type: String, required: true },
    questions: { type: [Schema.Types.Mixed], default: [] },
    difficulty: { type: String, default: 'intermediate' },
    sourceReferences: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true },
);

quizSchema.index({ ownerId: 1, lessonId: 1 });

export type QuizDoc = HydratedDocument<InferSchemaType<typeof quizSchema>> & { questions: Question[] };
export const Quiz = model('Quiz', quizSchema);

const quizAttemptSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },
    answers: [
      {
        _id: false,
        questionId: String,
        selectedOptionIndex: { type: Number, default: null },
        text: { type: String, default: '' },
        correct: Boolean,
        score: Number,
        maxScore: Number,
        feedback: { type: String, default: '' },
        relatedConcept: { type: String, default: '' },
        sectionId: { type: String, default: '' },
      },
    ],
    score: { type: Number, required: true },
    maxScore: { type: Number, required: true },
    startedAt: { type: Date, default: null },
    submittedAt: { type: Date, required: true },
  },
  { timestamps: false },
);

quizAttemptSchema.index({ ownerId: 1, submittedAt: -1 });
quizAttemptSchema.index({ ownerId: 1, lessonId: 1 });

export const QuizAttempt = model('QuizAttempt', quizAttemptSchema);
