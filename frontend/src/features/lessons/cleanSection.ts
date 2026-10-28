import type { LessonSection } from '@cyberlearn/shared';

/** Removes empty list entries before saving. */
export function cleanSection(s: LessonSection): LessonSection {
  const clean = (list: string[]) => list.map((x) => x.trim()).filter(Boolean);
  return {
    ...s,
    keyConcepts: clean(s.keyConcepts),
    commonMistakes: clean(s.commonMistakes),
    prerequisites: clean(s.prerequisites),
    warnings: clean(s.warnings),
    codeSnippets: s.codeSnippets.filter((c) => c.code.trim()),
  };
}
