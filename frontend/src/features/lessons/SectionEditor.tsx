import type { LessonSection } from '@cyberlearn/shared';
import { MarkdownEditor } from '../../components/forms/MarkdownEditor';
import { Input, Textarea } from '../../components/ui/Field';

const RICH_FIELDS: { key: keyof LessonSection; label: string }[] = [
  { key: 'definition', label: 'Definition' },
  { key: 'explanation', label: 'Detailed explanation' },
  { key: 'whyItMatters', label: 'Why it matters' },
  { key: 'howItWorks', label: 'How it works' },
  { key: 'example', label: 'Technical example' },
  { key: 'practicalApplication', label: 'Practical application' },
  { key: 'summary', label: 'Summary' },
];

const LIST_FIELDS: { key: 'commonMistakes' | 'keyConcepts' | 'prerequisites' | 'warnings'; label: string }[] = [
  { key: 'keyConcepts', label: 'Key concepts' },
  { key: 'commonMistakes', label: 'Common mistakes' },
  { key: 'prerequisites', label: 'Prerequisites' },
  { key: 'warnings', label: 'Important warnings' },
];

/** Edits every part of a generated section (spec 16 "Human review"). */
export function SectionEditor({ section, onChange }: { section: LessonSection; onChange: (s: LessonSection) => void }) {
  return (
    <div className="space-y-4">
      <Input label="Section title" value={section.title} onChange={(e) => onChange({ ...section, title: e.target.value.slice(0, 200) || section.title })} />
      {RICH_FIELDS.map((f) => (
        <MarkdownEditor key={f.key} label={f.label} value={String(section[f.key] ?? '')} onChange={(v) => onChange({ ...section, [f.key]: v })} />
      ))}
      <div className="grid md:grid-cols-2 gap-4">
        {LIST_FIELDS.map((f) => (
          <Textarea
            key={f.key}
            label={f.label}
            hint="one per line"
            className="[&_textarea]:min-h-[96px]"
            value={section[f.key].join('\n')}
            onChange={(e) =>
              onChange({
                ...section,
                [f.key]: e.target.value
                  .split('\n')
                  .map((x) => x.trimStart())
                  .filter((x, i, all) => x || i === all.length - 1),
              })
            }
          />
        ))}
      </div>
      {section.codeSnippets.map((snippet, i) => (
        <Textarea
          key={i}
          label={`Code snippet ${i + 1}${snippet.language ? ` (${snippet.language})` : ''}`}
          className="[&_textarea]:font-mono [&_textarea]:text-[13px]"
          value={snippet.code}
          onChange={(e) => onChange({ ...section, codeSnippets: section.codeSnippets.map((c, j) => (j === i ? { ...c, code: e.target.value } : c)) })}
        />
      ))}
    </div>
  );
}

export { cleanSection } from './cleanSection';
