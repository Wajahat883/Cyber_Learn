import { z } from 'zod';
import { DiagramSpecSchema, type DiagramSpec } from './diagram.js';

/** Visual teaching patterns (spec 4.8 "Presentation types") plus title/bullets/summary slides. */
export const SlideTypeSchema = z.enum([
  'title',
  'bullets',
  'progressive-diagram',
  'data-flow',
  'concept-illustration',
  'timeline',
  'comparison',
  'terminal',
  'decision-flow',
  'summary',
]);

export const AnimationEventTypeSchema = z.enum(['reveal', 'highlight', 'moveAlongPath', 'dim']);

export const AnimationEventSchema = z.object({
  atMs: z.number().int().nonnegative(),
  type: AnimationEventTypeSchema,
  targetId: z.string().min(1).max(80),
  /** For moveAlongPath: the diagram edge the token travels along. */
  pathId: z.string().max(80).optional(),
  durationMs: z.number().int().positive().max(20000).default(1200),
});

export const CaptionSchema = z.object({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  text: z.string().min(1).max(500),
});

/** Word-level timing from the speech engine, used for word-by-word captions. */
export const WordTimingSchema = z.object({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string().min(1).max(120),
});

export const NarrationSchema = z.object({
  text: z.string().max(5000).default(''),
  audioAssetId: z.string().max(40).optional(),
  captions: z.array(CaptionSchema).max(200).default([]),
  words: z.array(WordTimingSchema).max(3000).default([]),
  /** "provider" when the TTS service returned timings, "estimated" when derived from text length. */
  timing: z.enum(['provider', 'estimated']).default('estimated'),
});

const elementId = z.string().min(1).max(80);
const TextItemSchema = z.object({ id: elementId, text: z.string().min(1).max(600) });

export const SlideSchema = z.object({
  id: elementId,
  type: SlideTypeSchema,
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).default(''),
  sectionId: z.string().max(80).default(''),
  bullets: z.array(TextItemSchema).max(12).default([]),
  diagramId: z.string().max(80).optional(),
  imageAssetId: z.string().max(40).optional(),
  imageAlt: z.string().max(300).default(''),
  /** Editable HTML labels over an illustration, coordinates in percent of the image box. */
  annotations: z
    .array(z.object({ id: elementId, label: z.string().min(1).max(80), x: z.number().min(0).max(100), y: z.number().min(0).max(100) }))
    .max(10)
    .default([]),
  timeline: z
    .array(z.object({ id: elementId, time: z.string().max(60).default(''), label: z.string().min(1).max(160), detail: z.string().max(400).default('') }))
    .max(12)
    .default([]),
  comparison: z
    .object({
      left: z.object({ id: elementId, title: z.string().min(1).max(120), points: z.array(TextItemSchema).max(8) }),
      right: z.object({ id: elementId, title: z.string().min(1).max(120), points: z.array(TextItemSchema).max(8) }),
    })
    .optional(),
  terminal: z
    .array(z.object({ id: elementId, command: z.string().min(1).max(1000), output: z.string().max(3000).default('') }))
    .max(10)
    .default([]),
  durationMs: z.number().int().min(2000).max(180000),
  events: z.array(AnimationEventSchema).max(80).default([]),
  narration: NarrationSchema.default({ text: '', captions: [], words: [], timing: 'estimated' }),
  speakerNotes: z.string().max(5000).default(''),
});

export const PresentationManifestSchema = z
  .object({
    version: z.number().int().positive(),
    title: z.string().min(1).max(200),
    language: z.string().max(20).default('en'),
    diagrams: z.array(DiagramSpecSchema).max(40).default([]),
    slides: z.array(SlideSchema).min(1).max(80),
  })
  .superRefine((manifest, ctx) => {
    const diagrams = new Map(manifest.diagrams.map((d) => [d.id, d]));
    const slideIds = new Set<string>();
    manifest.slides.forEach((slide, s) => {
      if (slideIds.has(slide.id)) ctx.addIssue({ code: 'custom', message: `Duplicate slide id "${slide.id}"`, path: ['slides', s, 'id'] });
      slideIds.add(slide.id);
      if (slide.diagramId && !diagrams.has(slide.diagramId)) {
        ctx.addIssue({ code: 'custom', message: `Slide "${slide.id}" references unknown diagram`, path: ['slides', s, 'diagramId'] });
      }
      const targets = slideElementIds(slide, slide.diagramId ? diagrams.get(slide.diagramId) : undefined);
      const edges = new Set(slide.diagramId ? (diagrams.get(slide.diagramId)?.edges ?? []).map((e) => e.id) : []);
      slide.events.forEach((event, e) => {
        if (event.atMs > slide.durationMs) {
          ctx.addIssue({ code: 'custom', message: 'Event starts after the slide ends', path: ['slides', s, 'events', e, 'atMs'] });
        }
        if (!targets.has(event.targetId)) {
          ctx.addIssue({ code: 'custom', message: `Event targets unknown element "${event.targetId}"`, path: ['slides', s, 'events', e, 'targetId'] });
        }
        if (event.type === 'moveAlongPath' && (!event.pathId || !edges.has(event.pathId))) {
          ctx.addIssue({ code: 'custom', message: 'moveAlongPath needs a valid diagram edge as pathId', path: ['slides', s, 'events', e, 'pathId'] });
        }
      });
    });
  });

/** Every id an animation event may target on this slide. */
export function slideElementIds(slide: Slide, diagram?: DiagramSpec): Set<string> {
  const ids = new Set<string>(['title']);
  slide.bullets.forEach((b) => ids.add(b.id));
  slide.annotations.forEach((a) => ids.add(a.id));
  slide.timeline.forEach((t) => ids.add(t.id));
  slide.terminal.forEach((t) => ids.add(t.id));
  if (slide.imageAssetId) ids.add('image');
  if (slide.comparison) {
    for (const side of [slide.comparison.left, slide.comparison.right]) {
      ids.add(side.id);
      side.points.forEach((p) => ids.add(p.id));
    }
  }
  if (diagram) {
    diagram.nodes.forEach((n) => ids.add(n.id));
    diagram.edges.forEach((e) => ids.add(e.id));
  }
  return ids;
}

export type SlideType = z.infer<typeof SlideTypeSchema>;
export type AnimationEventType = z.infer<typeof AnimationEventTypeSchema>;
export type AnimationEvent = z.infer<typeof AnimationEventSchema>;
export type Caption = z.infer<typeof CaptionSchema>;
export type WordTiming = z.infer<typeof WordTimingSchema>;
export type Narration = z.infer<typeof NarrationSchema>;
export type Slide = z.infer<typeof SlideSchema>;
export type PresentationManifest = z.infer<typeof PresentationManifestSchema>;
