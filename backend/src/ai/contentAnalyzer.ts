import { ContentAnalysisSchema, type ContentAnalysis, type GenerationPreferences } from '@cyberlearn/shared';
import { ANALYZE_INSTRUCTIONS } from './prompts/index.js';
import type { AiUsage, TextGenerationProvider } from './types.js';

export interface ChunkInput {
  index: number;
  text: string;
  heading: string;
  page: number;
  sourceId: string;
  /** Database id of the chunk (when loaded from the database), for caching embeddings. */
  id?: string;
}

export interface AnalyzeContext {
  chunks: ChunkInput[];
  projectTitle: string;
  preferences: GenerationPreferences;
}

/** Above this size the analyzer sees each chunk's beginning only, and says so in the warnings. */
const FULL_TEXT_LIMIT = 300_000;

export function renderChunks(chunks: ChunkInput[], perChunkLimit?: number): string {
  return chunks
    .map((c) => {
      const label = [`chunk ${c.index}`, c.heading && `heading: ${c.heading}`, c.page && `page ${c.page}`].filter(Boolean).join(' | ');
      const text = perChunkLimit && c.text.length > perChunkLimit ? `${c.text.slice(0, perChunkLimit)} …` : c.text;
      return `[${label}]\n${text}`;
    })
    .join('\n\n');
}

export async function analyzeContent(provider: TextGenerationProvider, ctx: AnalyzeContext): Promise<{ analysis: ContentAnalysis; usage: AiUsage }> {
  const total = ctx.chunks.reduce((n, c) => n + c.text.length, 0);
  const condensed = total > FULL_TEXT_LIMIT;
  const content = `Project title: ${ctx.projectTitle}\n\n${renderChunks(ctx.chunks, condensed ? Math.floor(FULL_TEXT_LIMIT / ctx.chunks.length) : undefined)}`;
  const { data, usage } = await provider.generateStructured({
    task: 'analyze',
    instructions: ANALYZE_INSTRUCTIONS(ctx.preferences),
    content,
    schema: ContentAnalysisSchema,
    context: ctx,
  });
  const validChunks = new Set(ctx.chunks.map((c) => c.index));
  const analysis: ContentAnalysis = {
    ...data,
    sections: data.sections.map((s) => ({ ...s, sourceChunks: s.sourceChunks.filter((i) => validChunks.has(i)) })),
    warnings: condensed
      ? [...data.warnings, 'The material is very large, so planning used the beginning of each chunk. Each section is still written from its full source chunks.']
      : data.warnings,
  };
  return { analysis, usage };
}
