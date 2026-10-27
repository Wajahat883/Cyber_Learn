import {
  PresentationManifestSchema,
  slideElementIds,
  type AnimationEvent,
  type Caption,
  type DiagramSpec,
  type GenerationPreferences,
  type LessonSection,
  type PlannedVisual,
  type PresentationManifest,
  type Slide,
  type SlideType,
} from '@cyberlearn/shared';
import { sentences } from './text.js';

export interface AssemblerInput {
  title: string;
  summary: string;
  learningObjectives: string[];
  sections: LessonSection[];
  diagrams: DiagramSpec[];
  /** Planned layout visuals (timeline, comparison, code walkthrough) by section. */
  layouts: PlannedVisual[];
  /** Illustration asset ids by section id; the key "cover" is the lesson cover. */
  images: Record<string, string>;
  preferences: GenerationPreferences;
  language: string;
  version: number;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const plain = (s: string) =>
  s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const listItems = (md: string) =>
  md
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '').trim())
    .filter((l) => l.length > 3)
    .map(plain);

const STEP_MS = 2400;

function finish(slide: Omit<Slide, 'durationMs'> & { durationMs?: number }): Slide {
  const lastEvent = slide.events.reduce((m, e) => Math.max(m, e.atMs + e.durationMs), 0);
  const reading = Math.min(20000, slide.bullets.reduce((n, b) => n + b.text.split(' ').length * 120, 0));
  return { ...slide, durationMs: Math.min(180000, Math.max(6000, lastEvent + 3000, reading + 2000)) } as Slide;
}

function base(id: string, type: SlideType, title: string, sectionId = ''): Omit<Slide, 'durationMs'> {
  return {
    id,
    type,
    title: clip(title, 200),
    subtitle: '',
    sectionId,
    bullets: [],
    imageAlt: '',
    annotations: [],
    timeline: [],
    terminal: [],
    events: [{ atMs: 0, type: 'reveal', targetId: 'title', durationMs: 800 }],
    narration: { text: '', captions: [], timing: 'estimated' },
    speakerNotes: '',
  };
}

const revealList = (ids: string[], start = 1200, step = STEP_MS): AnimationEvent[] => ids.map((id, i) => ({ atMs: start + i * step, type: 'reveal', targetId: id, durationMs: 900 }));

function diagramSlide(section: LessonSection, diagram: DiagramSpec): Slide {
  const type: SlideType = diagram.type === 'data-flow' || diagram.type === 'architecture' ? 'data-flow' : diagram.type === 'decision-flow' ? 'decision-flow' : 'progressive-diagram';
  const slide = base(`${section.id}-diagram-${diagram.id}`.slice(0, 80), type, diagram.title, section.id);
  slide.subtitle = clip(plain(diagram.description), 300);
  slide.diagramId = diagram.id;
  const order = diagram.steps.length ? diagram.steps : diagram.nodes.map((n) => n.id);
  const revealed = new Set<string>();
  let t = 1200;
  for (const nodeId of order) {
    slide.events.push({ atMs: t, type: 'reveal', targetId: nodeId, durationMs: 900 });
    for (const edge of diagram.edges.filter((e) => e.target === nodeId && revealed.has(e.source))) {
      slide.events.push({ atMs: t, type: 'reveal', targetId: edge.id, durationMs: 900 });
      if (type === 'data-flow') slide.events.push({ atMs: t + 300, type: 'moveAlongPath', targetId: edge.id, pathId: edge.id, durationMs: 1600 });
    }
    revealed.add(nodeId);
    t += STEP_MS;
  }
  // Edges whose endpoints were revealed out of order.
  for (const edge of diagram.edges) {
    if (!slide.events.some((e) => e.targetId === edge.id)) slide.events.push({ atMs: t, type: 'reveal', targetId: edge.id, durationMs: 900 });
  }
  const last = order[order.length - 1];
  if (last) slide.events.push({ atMs: t + 400, type: 'highlight', targetId: last, durationMs: 1500 });
  slide.speakerNotes = diagram.nodes.map((n) => `${n.label}: ${n.description}`).join('\n');
  return finish(slide);
}

/** Assembles the versioned, validated presentation manifest the React player renders (spec 5.8). */
export function assemblePresentation(input: AssemblerInput): PresentationManifest {
  const concise = input.preferences.density === 'concise';
  const maxBullets = concise ? 3 : 5;
  const slides: Slide[] = [];

  const title = base('title', 'title', input.title);
  title.subtitle = clip(plain(input.summary), 300);
  title.bullets = input.learningObjectives.slice(0, 4).map((o, i) => ({ id: `objective-${i + 1}`, text: clip(plain(o), 600) }));
  title.events.push(...revealList(title.bullets.map((b) => b.id), 1500, 1500));
  if (input.images.cover) {
    title.imageAssetId = input.images.cover;
    title.imageAlt = `Illustration for ${input.title}`;
    title.events.push({ atMs: 0, type: 'reveal', targetId: 'image', durationMs: 1200 });
  }
  slides.push(finish(title));

  for (const section of input.sections) {
    const intro = base(`${section.id}-intro`.slice(0, 80), 'bullets', section.title, section.id);
    const points = [section.definition, ...listItems(section.howItWorks), ...section.keyConcepts.map((k) => `Key concept: ${k}`)]
      .map(plain)
      .filter(Boolean);
    intro.bullets = [...new Set(points)].slice(0, maxBullets).map((p, i) => ({ id: `${section.id}-b${i + 1}`.slice(0, 80), text: clip(p, 600) }));
    if (!intro.bullets.length) intro.bullets = [{ id: `${section.id}-b1`.slice(0, 80), text: clip(plain(section.summary || section.explanation) || section.title, 600) }];
    intro.events.push(...revealList(intro.bullets.map((b) => b.id)));
    intro.speakerNotes = plain(section.explanation).slice(0, 5000);
    slides.push(finish(intro));

    for (const diagram of input.diagrams.filter((d) => d.sectionId === section.id)) slides.push(diagramSlide(section, diagram));

    const layouts = input.layouts.filter((v) => v.sectionId === section.id).map((v) => v.type);
    const steps = listItems(section.howItWorks);
    if (layouts.includes('timeline') && steps.length >= 2) {
      const s = base(`${section.id}-timeline`.slice(0, 80), 'timeline', `${section.title}: step by step`, section.id);
      s.timeline = steps.slice(0, 8).map((step, i) => ({ id: `${section.id}-t${i + 1}`.slice(0, 80), time: `Step ${i + 1}`, label: clip(step, 160), detail: '' }));
      s.events.push(...revealList(s.timeline.map((t) => t.id)));
      slides.push(finish(s));
    }
    const practice = sentences(plain(section.practicalApplication)).slice(0, 4);
    if (!concise && section.commonMistakes.length && practice.length) {
      const s = base(`${section.id}-compare`.slice(0, 80), 'comparison', `${section.title}: good practice vs. common mistakes`, section.id);
      s.comparison = {
        left: { id: `${section.id}-good`.slice(0, 80), title: 'Good practice', points: practice.map((p, i) => ({ id: `${section.id}-g${i + 1}`.slice(0, 80), text: clip(p, 600) })) },
        right: { id: `${section.id}-bad`.slice(0, 80), title: 'Common mistakes', points: section.commonMistakes.slice(0, 4).map((p, i) => ({ id: `${section.id}-m${i + 1}`.slice(0, 80), text: clip(plain(p), 600) })) },
      };
      s.events.push(
        { atMs: 1000, type: 'reveal', targetId: s.comparison.left.id, durationMs: 900 },
        ...revealList(s.comparison.left.points.map((p) => p.id), 2000, 1800),
        { atMs: 2000 + s.comparison.left.points.length * 1800, type: 'reveal', targetId: s.comparison.right.id, durationMs: 900 },
        ...revealList(s.comparison.right.points.map((p) => p.id), 3000 + s.comparison.left.points.length * 1800, 1800),
      );
      slides.push(finish(s));
    }
    if (section.codeSnippets.length) {
      const s = base(`${section.id}-terminal`.slice(0, 80), 'terminal', `${section.title}: commands`, section.id);
      s.terminal = section.codeSnippets.slice(0, 6).map((c, i) => ({ id: `${section.id}-c${i + 1}`.slice(0, 80), command: clip(c.code, 1000), output: clip(c.caption, 3000) }));
      s.events.push(...revealList(s.terminal.map((t) => t.id), 1200, 3200));
      slides.push(finish(s));
    }
    const imageId = input.images[section.id];
    if (imageId) {
      const s = base(`${section.id}-illustration`.slice(0, 80), 'concept-illustration', section.title, section.id);
      s.imageAssetId = imageId;
      s.imageAlt = `Conceptual illustration of ${section.title}`;
      s.subtitle = clip(plain(section.definition), 300);
      const spots = [
        [18, 22],
        [78, 20],
        [20, 78],
        [80, 76],
        [50, 88],
      ];
      s.annotations = section.keyConcepts.slice(0, 5).map((k, i) => ({ id: `${section.id}-a${i + 1}`.slice(0, 80), label: clip(k, 80), x: spots[i][0], y: spots[i][1] }));
      s.events.push({ atMs: 300, type: 'reveal', targetId: 'image', durationMs: 1200 }, ...revealList(s.annotations.map((a) => a.id), 1800, 1600));
      slides.push(finish(s));
    }
  }

  const summary = base('summary', 'summary', 'Key takeaways');
  summary.bullets = input.sections
    .map((s) => plain(s.summary || s.definition))
    .filter(Boolean)
    .slice(0, 6)
    .map((t, i) => ({ id: `takeaway-${i + 1}`, text: clip(t, 600) }));
  if (!summary.bullets.length) summary.bullets = input.sections.slice(0, 6).map((s, i) => ({ id: `takeaway-${i + 1}`, text: clip(s.title, 600) }));
  summary.events.push(...revealList(summary.bullets.map((b) => b.id)));
  slides.push(finish(summary));

  return PresentationManifestSchema.parse({ version: input.version, title: clip(input.title, 200), language: input.language, diagrams: input.diagrams, slides: slides.slice(0, 80) });
}

/** Human-readable label of an element, used to find where narration mentions it. */
function elementLabel(slide: Slide, diagram: DiagramSpec | undefined, id: string): string {
  return (
    diagram?.nodes.find((n) => n.id === id)?.label ??
    slide.bullets.find((b) => b.id === id)?.text ??
    slide.timeline.find((t) => t.id === id)?.label ??
    slide.annotations.find((a) => a.id === id)?.label ??
    slide.terminal.find((t) => t.id === id)?.command ??
    ''
  );
}

const keyWords = (s: string) => (s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).slice(0, 4);

/**
 * Narration-to-animation synchronization (spec 4.8). Each visual event moves to
 * the caption that first mentions its element; others scale proportionally.
 * Events stay in their original order, so the visuals and the speech follow the
 * same plan.
 */
export function syncSlideToNarration(slide: Slide, diagram: DiagramSpec | undefined, text: string, captions: Caption[], narrationEndMs: number): Slide {
  if (!captions.length) return slide;
  const visualEnd = Math.max(1, slide.durationMs - 3000);
  const scale = Math.max(1, narrationEndMs / visualEnd);
  let floor = 0;
  const events = [...slide.events]
    .sort((a, b) => a.atMs - b.atMs)
    .map((event) => {
      let at = Math.round(event.atMs * scale);
      if (event.targetId !== 'title') {
        const label = elementLabel(slide, diagram, event.targetId);
        const words = keyWords(label);
        const caption = words.length ? captions.find((c) => c.startMs >= floor && words.some((w) => c.text.toLowerCase().includes(w))) : undefined;
        if (caption) at = caption.startMs;
      }
      at = Math.max(at, floor);
      floor = at;
      return { ...event, atMs: at };
    });
  const durationMs = Math.min(180000, Math.max(slide.durationMs, narrationEndMs + 1500, (events.at(-1)?.atMs ?? 0) + 3000));
  const valid = slideElementIds(slide, diagram);
  return {
    ...slide,
    durationMs,
    events: events.filter((e) => valid.has(e.targetId) && e.atMs <= durationMs),
    narration: { ...slide.narration, text, captions, timing: 'estimated' },
  };
}
