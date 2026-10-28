import type { LessonSection } from '@cyberlearn/shared';

/**
 * Verbatim check for technical claims (IMPROVEMENTS 3.4): commands, event IDs
 * and queries the model put in code blocks / inline code must appear in the
 * source text they are cited from. Anything that does not is reported so the
 * lesson can flag it instead of presenting an invented command as fact.
 */

type SectionText = Pick<LessonSection, 'definition' | 'explanation' | 'whyItMatters' | 'howItWorks' | 'example' | 'practicalApplication' | 'summary' | 'commonMistakes' | 'codeSnippets'> &
  Partial<Pick<LessonSection, 'warnings'>>;

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[`'"“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Shell prompts are presentation, not part of the command.
const stripPrompt = (line: string) => line.replace(/^\s*(?:\$|#\s|>|PS [^>]*>|C:\\[^>]*>)\s*/i, '').trim();

const isComment = (line: string) => /^\s*(?:#|\/\/|--|;|rem\s)/i.test(line);
const isNoise = (line: string) => line.length < 4 || !/[a-z0-9]/i.test(line);

/** Inline code worth checking: commands, flags, queries, paths, IDs (not single plain words). */
function looksTechnical(code: string): boolean {
  return (
    /\d{3,}/.test(code) ||
    /(?:^|\s)--?[a-z]/i.test(code) ||
    /[|=<>]/.test(code) ||
    /(?:^|\s)\/[a-z?]/i.test(code) ||
    /[\\/].*[\\/]/.test(code) ||
    /\w\(.*\)/.test(code) ||
    /^[a-z][\w.-]*\s+\S/.test(code)
  );
}

function codeLines(code: string): string[] {
  return code
    .split('\n')
    .filter((l) => !isComment(l))
    .map(stripPrompt)
    .filter((l) => !isNoise(l));
}

/** All technical claims made by a section, in order, de-duplicated. */
export function technicalClaims(section: SectionText): { code: string[]; eventIds: string[] } {
  const texts = [
    section.definition,
    section.explanation,
    section.whyItMatters,
    section.howItWorks,
    section.example,
    section.practicalApplication,
    section.summary,
    ...section.commonMistakes,
  ].filter(Boolean);
  const code: string[] = [];
  const eventIds: string[] = [];
  for (const text of texts) {
    let rest = text;
    for (const m of text.matchAll(/```[^\n]*\n?([\s\S]*?)```/g)) {
      code.push(...codeLines(m[1]));
      rest = rest.replace(m[0], ' ');
    }
    for (const m of rest.matchAll(/`([^`\n]+)`/g)) {
      const inline = stripPrompt(m[1]);
      if (!isNoise(inline) && looksTechnical(inline)) code.push(inline);
    }
    for (const m of rest.matchAll(/\bevent\s*(?:id|code)s?\s*(?:[:#=]\s*)?(\d{3,5})\b/gi)) eventIds.push(m[1]);
  }
  for (const snippet of section.codeSnippets) code.push(...codeLines(snippet.code));
  return { code: [...new Set(code)], eventIds: [...new Set(eventIds)] };
}

/** Claims from the section that do not appear verbatim (whitespace/case/quote-insensitive) in `sourceText`. */
export function findUnverifiedClaims(section: SectionText, sourceText: string): string[] {
  const source = normalize(sourceText);
  const { code, eventIds } = technicalClaims(section);
  const out: string[] = [];
  for (const claim of code) if (!source.includes(normalize(claim))) out.push(claim.slice(0, 300));
  for (const id of eventIds) if (!new RegExp(`(?<!\\d)${id}(?!\\d)`).test(source)) out.push(`Event ID ${id}`);
  return [...new Set(out)].slice(0, 30);
}
