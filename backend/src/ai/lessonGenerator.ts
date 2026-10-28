import {
  GeneratedSectionSchema,
  type ContentAnalysis,
  type GenerationPreferences,
  type LessonSection,
  type PlannedSection,
} from '@cyberlearn/shared';
import { z } from 'zod';
import { renderChunks, type ChunkInput } from './contentAnalyzer.js';
import { EXAMPLES_INSTRUCTIONS, SECTION_INSTRUCTIONS } from './prompts/index.js';
import { findUnverifiedClaims } from './verbatim.js';
import type { AiUsage, TextGenerationProvider } from './types.js';

export interface SectionContext {
  section: PlannedSection;
  chunks: ChunkInput[];
  analysis: ContentAnalysis;
  preferences: GenerationPreferences;
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);

/** Chunks a section is grounded in: the analyzer's choice, else heading match, else keyword overlap. */
export function relevantChunks(section: PlannedSection, chunks: ChunkInput[], max = 6): ChunkInput[] {
  const byIndex = new Map(chunks.map((c) => [c.index, c]));
  const chosen = section.sourceChunks.map((i) => byIndex.get(i)).filter((c): c is ChunkInput => Boolean(c));
  if (chosen.length) return chosen.slice(0, max);
  const title = section.title.toLowerCase();
  const headed = chunks.filter((c) => c.heading.toLowerCase() === title);
  if (headed.length) return headed.slice(0, max);
  const target = words([section.title, ...section.concepts].join(' '));
  return chunks
    .map((c) => ({ c, score: [...words(`${c.heading} ${c.text}`)].filter((w) => target.has(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.c.index - b.c.index)
    .slice(0, Math.min(max, 3))
    .map((x) => x.c);
}

export async function generateSection(provider: TextGenerationProvider, ctx: SectionContext): Promise<{ section: LessonSection; usage: AiUsage }> {
  const content = `Lesson: ${ctx.analysis.title}
Section to write: ${ctx.section.title}
Concepts to cover: ${ctx.section.concepts.join(', ') || '(choose from the material)'}
Other sections in this lesson: ${ctx.analysis.sections.map((s) => s.title).join('; ')}

${renderChunks(ctx.chunks)}`;
  const { data, usage } = await provider.generateStructured({
    task: 'section',
    instructions: SECTION_INSTRUCTIONS(ctx.preferences),
    content,
    schema: GeneratedSectionSchema,
    context: ctx,
  });
  const byIndex = new Map(ctx.chunks.map((c) => [c.index, c]));
  // Only chunks the model actually cited are credited; an uncited section records no citation
  // (it is not credited to every input chunk).
  const used = [...new Set(data.sourceChunks.filter((i) => byIndex.has(i)))];
  const refs = used.map((i) => {
    const chunk = byIndex.get(i)!;
    return { sourceId: chunk.sourceId, chunkIndex: i, excerpt: chunk.text.slice(0, 280) };
  });
  const { sourceChunks: _ignored, ...rest } = data;
  // Commands / event IDs / queries must appear in the cited source (or, when nothing is cited, in the material given).
  const evidence = (used.length ? used.map((i) => byIndex.get(i)!) : ctx.chunks).map((c) => `${c.heading}\n${c.text}`).join('\n');
  const unverifiedClaims = findUnverifiedClaims(rest, evidence);
  return { section: { ...rest, id: ctx.section.id, title: ctx.section.title, sourceRefs: refs, unverifiedClaims }, usage };
}

export const ExamplesSchema = z.object({
  examples: z.array(z.object({ title: z.string().min(1).max(200), body: z.string().min(1).max(4000), supplementary: z.boolean().default(false) })).min(1).max(5),
});

export async function generateExamples(provider: TextGenerationProvider, ctx: { section: LessonSection; chunks: ChunkInput[]; preferences: GenerationPreferences }) {
  return provider.generateStructured({
    task: 'examples',
    instructions: EXAMPLES_INSTRUCTIONS(ctx.preferences),
    content: `Section: ${ctx.section.title}\n${ctx.section.explanation}\n\n${renderChunks(ctx.chunks)}`,
    schema: ExamplesSchema,
    context: ctx,
  });
}
