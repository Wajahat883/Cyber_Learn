import type {
  ContentAnalysis,
  ConceptRelationship,
  DiagramSpec,
  GenerationPreferences,
  GenerationStatus,
  GenerationStage,
  KeyTerm,
  LessonSection,
  PresentationManifest,
  PublicQuestion,
  StageResult,
  UserPreferences,
} from '@cyberlearn/shared';

/** Shapes of API responses as seen by the browser (ids are strings, dates ISO strings). */

export interface User {
  id: string;
  email: string;
  displayName: string;
  preferences: UserPreferences;
  createdAt?: string;
}

export interface Subject {
  _id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  projectCount?: number;
}

export interface LearningPath {
  _id: string;
  subjectId: string;
  title: string;
  description: string;
  modules: { _id: string; title: string; description: string; projectIds: string[] }[];
}

export interface Project {
  _id: string;
  title: string;
  description: string;
  subjectId: string | null;
  subject: string;
  tags: string[];
  status: { content: string; media: string; export: string };
  preferences: GenerationPreferences;
  favorite: boolean;
  lessonId: string | null;
  lastStudiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Source {
  _id: string;
  projectId: string;
  title: string;
  sourceType: 'text' | 'upload';
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  extractionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  extractionError: string;
  chunkCount: number;
  charCount: number;
  metadata: { pageCount: number; headings: string[] };
  createdAt: string;
}

export interface SourceChunk {
  index: number;
  text: string;
  heading: string;
  page: number;
}

export interface Generation {
  _id: string;
  projectId: string | { _id: string; title: string };
  status: GenerationStatus;
  currentStage: GenerationStage | null;
  stageResults: StageResult[];
  preferences: GenerationPreferences;
  analysis?: ContentAnalysis | null;
  lessonId: string | null;
  presentationId: string | null;
  errorMessage: string;
  usage?: { aiCalls: number; inputChars: number; outputChars: number };
  createdAt: string;
  completedAt: string | null;
}

export interface Lesson {
  _id: string;
  projectId: string;
  sourceIds: string[];
  title: string;
  subject: string;
  difficulty: string;
  language: string;
  summary: string;
  learningObjectives: string[];
  sections: LessonSection[];
  keyTerms: KeyTerm[];
  prerequisites: string[];
  conceptLinks: ConceptRelationship[];
  diagrams: DiagramSpec[];
  warnings: string[];
  generationStatus: string;
  version: number;
  updatedAt: string;
}

export interface Presentation {
  _id: string;
  lessonId: string;
  projectId: string;
  title: string;
  version: number;
  manifest: PresentationManifest;
  playbackSettings: { speed: number; captions: boolean };
  status: string;
  updatedAt: string;
}

export interface Asset {
  _id: string;
  assetType: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  error: string;
  lessonId: string | null;
  projectId: string | null;
  generationMetadata: { prompt: string; provider: string; model: string; topic: string; sectionId: string; slideIds: string[]; fallback: boolean };
  createdAt: string;
}

export interface Flashcard {
  _id: string;
  lessonId: string;
  front: string;
  back: string;
  explanation: string;
  conceptId: string;
  sectionId: string;
  difficulty: string;
  review?: { nextReviewAt: string; intervalDays: number; reviewCount: number; lapses: number } | null;
}

export interface Quiz {
  _id: string;
  lessonId: string;
  title: string;
  difficulty: string;
  questions: PublicQuestion[];
}

export interface Progress {
  lessonId: string;
  lastSlideViewed: number;
  completedSections: string[];
  bookmarks: string[];
  timeSpentSeconds: number;
  completionStatus: 'not_started' | 'in_progress' | 'completed';
  lastStudiedAt: string | null;
}

export interface WeakTopic {
  concept: string;
  lessonId: string;
  lessonTitle: string;
  mistakes: number;
  attempts: number;
}
