import {
  DiagramSpecSchema,
  GeneratedDiagramSchema,
  type ContentAnalysis,
  type DiagramSpec,
  type GenerationPreferences,
  type LessonSection,
  type PlannedVisual,
  type VisualType,
} from '@cyberlearn/shared';
import { renderChunks, type ChunkInput } from './contentAnalyzer.js';
import { DIAGRAM_INSTRUCTIONS } from './prompts/index.js';
import type { AiUsage, TextGenerationProvider } from './types.js';

/** Visual types rendered as deterministic node/edge diagrams (spec 5.3: prefer these when exact relationships matter). */
export const DIAGRAM_TYPES: VisualType[] = [
  'flowchart',
  'architecture',
  'data-flow',
  'entity-relationship',
  'sequence',
  'concept-map',
  'decision-flow',
];

export interface VisualPlan {
  diagrams: PlannedVisual[];
  illustrations: PlannedVisual[];
  /** Visuals rendered directly by slide layouts (timeline, comparison, code walkthrough, chart). */
  layouts: PlannedVisual[];
}

/** Decides which planned visuals become diagrams, illustrations or slide layouts, respecting the user's visual mode. */
export function planVisuals(analysis: ContentAnalysis, preferences: GenerationPreferences): VisualPlan {
  const included = new Set(analysis.sections.filter((s) => s.include).map((s) => s.id));
  const visuals = analysis.visuals.filter((v) => included.has(v.sectionId));
  const wantDiagrams = preferences.visualMode !== 'illustrations';
  const wantImages = preferences.visualMode !== 'diagrams';

  const diagrams = wantDiagrams ? visuals.filter((v) => DIAGRAM_TYPES.includes(v.type)).slice(0, 10) : [];
  let illustrations = wantImages ? visuals.filter((v) => v.type === 'conceptual-image').slice(0, 4) : [];
  if (wantImages && illustrations.length === 0) {
    // One cover illustration for the lesson so illustration mode always has something to show.
    const first = analysis.sections.find((s) => s.include);
    if (first) illustrations = [{ id: 'cover-illustration', type: 'conceptual-image', purpose: `Conceptual overview of ${analysis.mainTopic}`, sectionId: first.id }];
  }
  // In illustration-only mode, diagram-worthy visuals become illustrations instead of being lost.
  if (!wantDiagrams) {
    illustrations = [
      ...illustrations,
      ...visuals
        .filter((v) => DIAGRAM_TYPES.includes(v.type))
        .slice(0, 3)
        .map((v) => ({ ...v, type: 'conceptual-image' as const })),
    ];
  }
  const layouts = visuals.filter((v) => ['timeline', 'comparison', 'code-walkthrough', 'chart'].includes(v.type));
  return { diagrams, illustrations, layouts };
}

export interface DiagramContext {
  visual: PlannedVisual;
  section: LessonSection;
  chunks: ChunkInput[];
  keyTerms: { term: string; definition: string }[];
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'node';

/**
 * Generates and validates a diagram. Invalid references are removed (never
 * invented); if the result still fails validation the diagram is rejected.
 */
export async function generateDiagram(provider: TextGenerationProvider, ctx: DiagramContext): Promise<{ diagram: DiagramSpec; usage: AiUsage }> {
  const content = `Diagram type: ${ctx.visual.type}
Diagram purpose: ${ctx.visual.purpose}

Section: ${ctx.section.title}
${ctx.section.definition}
${ctx.section.howItWorks}
Key concepts: ${ctx.section.keyConcepts.join(', ')}

${renderChunks(ctx.chunks)}`;
  const { data, usage } = await provider.generateStructured({
    task: 'diagram',
    instructions: DIAGRAM_INSTRUCTIONS(),
    content,
    schema: GeneratedDiagramSchema,
    context: ctx,
  });

  const idMap = new Map<string, string>();
  const nodes = data.nodes.map((n) => {
    let id = slug(n.id);
    while ([...idMap.values()].includes(id)) id = `${id}-x`;
    idMap.set(n.id, id);
    return { ...n, id };
  });
  const edges = data.edges
    .map((e, i) => ({ ...e, id: `e${i + 1}`, source: idMap.get(e.source) ?? '', target: idMap.get(e.target) ?? '' }))
    .filter((e) => e.source && e.target && e.source !== e.target);
  const steps = data.steps.map((s) => idMap.get(s)).filter((s): s is string => Boolean(s));

  const diagram = DiagramSpecSchema.parse({
    id: slug(`${ctx.visual.sectionId}-${ctx.visual.type}-${ctx.visual.id}`),
    title: data.title,
    type: ctx.visual.type,
    description: data.description,
    sectionId: ctx.visual.sectionId,
    direction: data.direction,
    nodes,
    edges,
    steps: steps.length ? [...new Set(steps)] : nodes.map((n) => n.id),
  });
  return { diagram, usage };
}

/** Deterministic, text-free prompt for a conceptual illustration. Labels are added later as HTML overlays (spec 4.10). */
export function illustrationPrompt(visual: PlannedVisual, section: LessonSection | undefined, subject: string): string {
  const concepts = section?.keyConcepts.slice(0, 5).join(', ');
  return [
    `Educational conceptual illustration for a ${subject || 'technical'} lesson.`,
    `Purpose: ${visual.purpose}.`,
    section ? `Topic: ${section.title}.` : '',
    concepts ? `Visual metaphors for: ${concepts}.` : '',
    'Clean modern flat style, dark navy background with cyan and violet accents, no text, no letters, no logos, no real people.',
  ]
    .filter(Boolean)
    .join(' ');
}
