import { z } from 'zod';
import type { Caption, GenerationPreferences, Slide } from '@cyberlearn/shared';
import { NARRATION_INSTRUCTIONS } from './prompts/index.js';
import type { AiUsage, TextGenerationProvider } from './types.js';
import { sentences } from '../services/text.js';

export const NarrationOutputSchema = z.object({
  slides: z.array(z.object({ slideId: z.string().min(1), text: z.string().min(1).max(5000) })).min(1).max(80),
});

export interface NarrationContext {
  lessonTitle: string;
  slides: Slide[];
  /** Labels of diagram nodes per slide id, in reveal order. */
  diagramLabels: Record<string, string[]>;
  preferences: GenerationPreferences;
}

/** Describes slides as plain text for the narration model (the same data that drives the animations). */
export function describeSlides(ctx: NarrationContext): string {
  return ctx.slides
    .map((s) => {
      const parts = [`[slide ${s.id}] type: ${s.type}; title: ${s.title}`];
      if (s.subtitle) parts.push(`subtitle: ${s.subtitle}`);
      if (s.bullets.length) parts.push(`points: ${s.bullets.map((b) => b.text).join(' | ')}`);
      if (ctx.diagramLabels[s.id]?.length) parts.push(`diagram components in order: ${ctx.diagramLabels[s.id].join(' -> ')}`);
      if (s.timeline.length) parts.push(`timeline: ${s.timeline.map((t) => `${t.time} ${t.label}`).join(' | ')}`);
      if (s.comparison) parts.push(`compare ${s.comparison.left.title} vs ${s.comparison.right.title}`);
      if (s.terminal.length) parts.push(`commands: ${s.terminal.map((t) => t.command).join(' | ')}`);
      if (s.annotations.length) parts.push(`illustration labels: ${s.annotations.map((a) => a.label).join(', ')}`);
      return parts.join('\n');
    })
    .join('\n\n');
}

export async function generateNarration(provider: TextGenerationProvider, ctx: NarrationContext): Promise<{ texts: Map<string, string>; usage: AiUsage }> {
  const { data, usage } = await provider.generateStructured({
    task: 'narration',
    instructions: NARRATION_INSTRUCTIONS(ctx.preferences),
    content: `Lesson: ${ctx.lessonTitle}\n\n${describeSlides(ctx)}`,
    schema: NarrationOutputSchema,
    context: ctx,
  });
  const ids = new Set(ctx.slides.map((s) => s.id));
  return { texts: new Map(data.slides.filter((s) => ids.has(s.slideId)).map((s) => [s.slideId, s.text])), usage };
}

/** Speaking rate used for estimated timing at 1x playback (about 150 words per minute). */
export const MS_PER_WORD = 400;

export function estimateSpeechMs(text: string): number {
  const count = text.trim().split(/\s+/).filter(Boolean).length;
  return count * MS_PER_WORD;
}

/** Sentence-level captions with estimated timing (used when the TTS provider returns no timings). */
export function buildCaptions(text: string, startMs = 600): { captions: Caption[]; endMs: number } {
  let t = startMs;
  const captions: Caption[] = [];
  for (const sentence of sentences(text)) {
    const duration = Math.max(1200, estimateSpeechMs(sentence));
    captions.push({ startMs: t, endMs: t + duration, text: sentence.slice(0, 500) });
    t += duration;
  }
  return { captions, endMs: t };
}
