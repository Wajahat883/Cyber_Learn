import { GeneratedAssessmentSchema, type GeneratedAssessment, type GenerationPreferences, type KeyTerm, type LessonSection } from '@cyberlearn/shared';
import { ASSESSMENT_INSTRUCTIONS } from './prompts/index.js';
import type { AiUsage, TextGenerationProvider } from './types.js';

export interface AssessmentContext {
  title: string;
  sections: LessonSection[];
  keyTerms: KeyTerm[];
  preferences: GenerationPreferences;
}

export function renderLesson(title: string, sections: LessonSection[]): string {
  return [
    `# ${title}`,
    ...sections.map((s) =>
      [`## ${s.title} [sectionId: ${s.id}]`, s.definition, s.explanation, s.howItWorks, s.example, s.summary, ...s.codeSnippets.map((c) => '```\n' + c.code + '\n```')]
        .filter(Boolean)
        .join('\n\n'),
    ),
  ].join('\n\n');
}

export async function generateAssessment(provider: TextGenerationProvider, ctx: AssessmentContext): Promise<{ assessment: GeneratedAssessment; usage: AiUsage }> {
  const { quizzes, flashcards } = ctx.preferences;
  const { data, usage } = await provider.generateStructured({
    task: 'assessment',
    instructions: ASSESSMENT_INSTRUCTIONS(ctx.preferences, quizzes, flashcards),
    content: renderLesson(ctx.title, ctx.sections),
    schema: GeneratedAssessmentSchema,
    context: ctx,
  });
  const sectionIds = new Set(ctx.sections.map((s) => s.id));
  const seen = new Set<string>();
  const questions = (quizzes ? data.questions : [])
    .map((q, i) => {
      let id = q.id;
      if (seen.has(id)) id = `q${i + 1}-${seen.size}`;
      seen.add(id);
      return { ...q, id, sectionId: sectionIds.has(q.sectionId) ? q.sectionId : '' };
    })
    // Drop exact duplicate prompts.
    .filter((q, i, all) => all.findIndex((x) => x.prompt.trim().toLowerCase() === q.prompt.trim().toLowerCase()) === i);
  const cards = (flashcards ? data.flashcards : [])
    .map((c) => ({ ...c, sectionId: sectionIds.has(c.sectionId) ? c.sectionId : '' }))
    .filter((c, i, all) => all.findIndex((x) => x.front.trim().toLowerCase() === c.front.trim().toLowerCase()) === i);
  return { assessment: { questions, flashcards: cards }, usage };
}
