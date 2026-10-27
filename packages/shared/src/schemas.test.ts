import { describe, expect, it } from 'vitest';
import {
  ContentAnalysisSchema,
  DiagramSpecSchema,
  PresentationManifestSchema,
  QuestionSchema,
  scheduleReview,
  INITIAL_REVIEW_STATE,
  toPublicQuestion,
} from './index.js';

const diagram = {
  id: 'siem-flow',
  title: 'SIEM data flow',
  type: 'data-flow' as const,
  nodes: [
    { id: 'source', label: 'Log Sources', kind: 'source' as const },
    { id: 'siem', label: 'SIEM', kind: 'processor' as const },
    { id: 'analyst', label: 'SOC Analyst', kind: 'destination' as const },
  ],
  edges: [
    { id: 'e1', source: 'source', target: 'siem', label: 'Security events' },
    { id: 'e2', source: 'siem', target: 'analyst', label: 'Alerts' },
  ],
};

describe('DiagramSpecSchema', () => {
  it('accepts a valid diagram', () => {
    expect(DiagramSpecSchema.safeParse(diagram).success).toBe(true);
  });

  it('rejects edges pointing to unknown nodes', () => {
    const bad = { ...diagram, edges: [{ id: 'e1', source: 'source', target: 'ghost' }] };
    const result = DiagramSpecSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects duplicate node ids', () => {
    const bad = { ...diagram, nodes: [...diagram.nodes, { id: 'siem', label: 'Again' }] };
    expect(DiagramSpecSchema.safeParse(bad).success).toBe(false);
  });
});

describe('PresentationManifestSchema', () => {
  const slide = {
    id: 'siem-architecture-01',
    type: 'data-flow' as const,
    title: 'SIEM Architecture',
    diagramId: 'siem-flow',
    durationMs: 18000,
    events: [
      { atMs: 0, type: 'reveal' as const, targetId: 'source' },
      { atMs: 3000, type: 'highlight' as const, targetId: 'e1' },
      { atMs: 6000, type: 'moveAlongPath' as const, targetId: 'e1', pathId: 'e1' },
    ],
  };

  it('accepts events targeting diagram elements', () => {
    const result = PresentationManifestSchema.safeParse({ version: 1, title: 'SIEM', diagrams: [diagram], slides: [slide] });
    expect(result.success).toBe(true);
  });

  it('rejects events targeting unknown elements', () => {
    const bad = { ...slide, events: [{ atMs: 0, type: 'reveal', targetId: 'nope' }] };
    const result = PresentationManifestSchema.safeParse({ version: 1, title: 'SIEM', diagrams: [diagram], slides: [bad] });
    expect(result.success).toBe(false);
  });

  it('rejects moveAlongPath without a valid edge', () => {
    const bad = { ...slide, events: [{ atMs: 0, type: 'moveAlongPath', targetId: 'e1', pathId: 'nope' }] };
    const result = PresentationManifestSchema.safeParse({ version: 1, title: 'SIEM', diagrams: [diagram], slides: [bad] });
    expect(result.success).toBe(false);
  });
});

describe('ContentAnalysisSchema', () => {
  it('rejects visuals referencing unknown sections', () => {
    const result = ContentAnalysisSchema.safeParse({
      title: 'SIEM',
      subject: 'Cybersecurity',
      mainTopic: 'SIEM',
      difficulty: 'intermediate',
      sections: [{ id: 's1', title: 'Log collection' }],
      visuals: [{ id: 'v1', type: 'data-flow', purpose: 'Flow', sectionId: 's9' }],
      suggestedSlideCount: 5,
    });
    expect(result.success).toBe(false);
  });
});

describe('QuestionSchema', () => {
  it('requires a valid correct option for MCQs', () => {
    const q = { id: 'q1', type: 'mcq', prompt: 'What?', options: ['A', 'B'], correctOptionIndex: 2, explanation: 'x' };
    expect(QuestionSchema.safeParse(q).success).toBe(false);
    expect(QuestionSchema.safeParse({ ...q, correctOptionIndex: 1 }).success).toBe(true);
  });

  it('strips answer keys for public questions', () => {
    const q = QuestionSchema.parse({ id: 'q1', type: 'mcq', prompt: 'What?', options: ['A', 'B'], correctOptionIndex: 1, explanation: 'x' });
    const pub = toPublicQuestion(q) as Record<string, unknown>;
    expect(pub.correctOptionIndex).toBeUndefined();
    expect(pub.explanation).toBeUndefined();
  });
});

describe('scheduleReview', () => {
  it('grows intervals on successful reviews and resets on failure', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const first = scheduleReview(INITIAL_REVIEW_STATE, 4, now);
    expect(first.intervalDays).toBe(1);
    const second = scheduleReview(first, 4, now);
    expect(second.intervalDays).toBe(6);
    const third = scheduleReview(second, 5, now);
    expect(third.intervalDays).toBeGreaterThan(6);
    const failed = scheduleReview(third, 1, now);
    expect(failed.intervalDays).toBe(1);
    expect(failed.repetitions).toBe(0);
  });
});
