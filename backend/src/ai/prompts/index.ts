import type { GenerationPreferences } from '@cyberlearn/shared';

const LANGUAGE: Record<string, string> = {
  en: 'Write all learner-facing text in clear English.',
  'roman-urdu':
    'Write learner-facing explanations in Roman Urdu (Urdu written with Latin letters), but keep every technical term, command, tool name, event ID and acronym in English exactly as in the source.',
  bilingual:
    'Write learner-facing explanations in English, followed where helpful by a short Roman Urdu clarification. Keep technical terms, commands and identifiers in English.',
};

const LEVEL: Record<string, string> = {
  beginner: 'The learner is a beginner: define jargon, use simple analogies and small steps.',
  intermediate: 'The learner is intermediate: assume basic familiarity, focus on how and why.',
  advanced: 'The learner is advanced: be precise and dense, focus on edge cases, internals and trade-offs.',
};

export function audience(p: GenerationPreferences): string {
  return [LANGUAGE[p.language] ?? LANGUAGE.en, LEVEL[p.difficulty] ?? LEVEL.intermediate, p.density === 'concise' ? 'Keep it concise.' : 'Be thorough and detailed.'].join(' ');
}

export const ANALYZE_INSTRUCTIONS = (p: GenerationPreferences) => `Analyze the learning material and produce a structured learning plan.
- Detect the subject (e.g. "Cybersecurity", "Networking", "Programming") and the main topic.
- Split the material into 2-12 logical sections in teaching order. Give each a short kebab-case id (e.g. "log-collection"), a title, its key concepts, and the indexes of the source chunks it is based on (chunk numbers are shown as [chunk N]).
- Extract important terms with one-sentence definitions grounded in the material.
- List prerequisite concepts the learner should already know.
- List relationships between concepts (from, to, short verb label) that are stated or clearly implied in the material.
- Propose visuals that would genuinely help understanding. Choose the type that fits the content: data-flow or architecture for systems and pipelines, flowchart or decision-flow for procedures and investigations, timeline for chronological events, comparison for contrasts, sequence for message exchanges, code-walkthrough for commands, concept-map for theory, conceptual-image only where an illustration adds understanding. Each visual references a section id.
- Suggest a slide count and add warnings for incomplete, ambiguous or possibly outdated material.
${audience(p)}`;

export const SECTION_INSTRUCTIONS = (p: GenerationPreferences, title: string) => `Write the lesson section "${title}" from the material.
Fill: definition, explanation, whyItMatters, howItWorks, example, commonMistakes, practicalApplication, summary, prerequisites, keyConcepts, warnings, codeSnippets.
Use Markdown in text fields (lists, **bold**, \`inline code\`). Never output HTML.
Ground the content in the material. Put any claim that is NOT supported by the material into supplementaryNotes instead of mixing it into the explanation, and set grounding to "source", "supplementary" or "mixed" accordingly.
Only include commands, event IDs or query syntax that appear in the material; copy them exactly. Leave a field empty rather than inventing content.
Set sourceChunks to the chunk numbers you used.
${audience(p)}`;

export const ASSESSMENT_INSTRUCTIONS = (p: GenerationPreferences, wantQuiz: boolean, wantCards: boolean) => `Create revision material from the lesson.
${wantCards ? '- 6-20 flashcards: front is a precise question or term, back is a short correct answer. Set conceptId and sectionId.' : '- Return an empty flashcards array.'}
${
  wantQuiz
    ? `- 6-15 questions mixing types: mcq (4 plausible, clearly distinct options, exactly one correct, correctOptionIndex set), true-false (options ["True","False"]), short-answer and explain (answer = model answer, rubric = key points), and where the material involves logs, alerts or investigations also log-analysis / scenario / next-step questions with the evidence in "context".
- Every answer must follow from the lesson. Scenario questions must distinguish confirmed evidence from hypotheses.
- Give each question a unique id like "q1", an explanation, difficulty, relatedConcept and sectionId.`
    : '- Return an empty questions array.'
}
${audience(p)}`;

export const DIAGRAM_INSTRUCTIONS = (type: string, purpose: string) => `Create a "${type}" diagram whose purpose is: ${purpose}.
- Use 3-12 nodes with short ids (letters, digits, - or _), short labels and a one-sentence description each.
- Node kinds: source, processor, storage, destination, actor, decision, concept, event.
- Only draw edges for relationships stated or clearly implied by the material. Never invent connections or components.
- Set steps to the node ids in the order they should be revealed when teaching.
- Use direction "LR" for flows and "TB" for hierarchies or decision trees.`;

export const NARRATION_INSTRUCTIONS = (p: GenerationPreferences) => `Write instructor-style narration for each slide, as a knowledgeable teacher speaking to one learner.
- Do not read bullets verbatim; explain them naturally and connect them to the previous slide.
- For diagram slides, explain the components in the order given.
- Keep technical terminology exact. 40-120 words per slide.
- Return one entry per slide id, in the same order.
${audience(p)}`;

export const ANSWER_INSTRUCTIONS = (language: string) => `Answer the learner's question using ONLY the numbered notes provided as source material.
- If the notes do not contain the answer, set supported to false and say clearly that the notes do not cover it.
- Cite the chunk numbers you relied on.
- Use Markdown. ${LANGUAGE[language] ?? LANGUAGE.en}`;

export const EXAMPLES_INSTRUCTIONS = (p: GenerationPreferences, title: string) => `Write 2-3 additional worked examples that illustrate "${title}".
Each example must be consistent with the material. Mark anything not found in the material as supplementary.
${audience(p)}`;
