import { Schema, model } from 'mongoose';

/** One progress summary per user and lesson. Opening a lesson never counts as mastering it. */
const progressSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    lastSlideViewed: { type: Number, default: 0 },
    completedSections: { type: [String], default: [] },
    bookmarks: { type: [String], default: [] },
    timeSpentSeconds: { type: Number, default: 0 },
    completionStatus: { type: String, enum: ['not_started', 'in_progress', 'completed'], default: 'not_started' },
    lastStudiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

progressSchema.index({ ownerId: 1, lessonId: 1 }, { unique: true });
progressSchema.index({ ownerId: 1, lastStudiedAt: -1 });

export const Progress = model('Progress', progressSchema);

/** Append-only log of real study activity: drives streaks, study time and project activity. */
const activitySchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', default: null },
    type: {
      type: String,
      enum: [
        'project_created',
        'source_added',
        'generation_started',
        'generation_finished',
        'lesson_edited',
        'section_completed',
        'study_time',
        'flashcard_review',
        'quiz_attempt',
        'export_created',
        'presentation_version',
      ],
      required: true,
    },
    seconds: { type: Number, default: 0 },
    detail: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activitySchema.index({ ownerId: 1, createdAt: -1 });
activitySchema.index({ projectId: 1, createdAt: -1 });
/**
 * The log would otherwise grow without bound. Old entries expire after ACTIVITY_TTL_DAYS;
 * 400 days matches the longest look-back used by the stats (study streak).
 */
export const ACTIVITY_TTL_DAYS = 400;
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: ACTIVITY_TTL_DAYS * 24 * 3600 });

export const Activity = model('Activity', activitySchema);
