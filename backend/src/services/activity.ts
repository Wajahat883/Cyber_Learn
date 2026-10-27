import { Activity } from '../models/index.js';
import { logger } from '../utils/logger.js';

type ActivityType =
  | 'project_created'
  | 'source_added'
  | 'generation_started'
  | 'generation_finished'
  | 'lesson_edited'
  | 'section_completed'
  | 'study_time'
  | 'flashcard_review'
  | 'quiz_attempt'
  | 'export_created'
  | 'presentation_version';

/** Records real user activity. Failures never break the user's request. */
export async function recordActivity(entry: {
  ownerId: string;
  type: ActivityType;
  projectId?: unknown;
  lessonId?: unknown;
  seconds?: number;
  detail?: string;
}) {
  try {
    await Activity.create({ ...entry, detail: entry.detail?.slice(0, 300) ?? '' });
  } catch (err) {
    logger.warn({ err }, 'Failed to record activity');
  }
}
