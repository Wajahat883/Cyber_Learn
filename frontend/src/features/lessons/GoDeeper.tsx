import { useState, type ReactNode } from 'react';
import { AlertTriangle, Info, Lightbulb, Play, Sparkles } from 'lucide-react';
import type { LessonSection } from '@cyberlearn/shared';
import { cn } from '../../lib/cn';
import { Markdown } from '../../components/ui/Markdown';

type DeepTab = 'example' | 'why' | 'practice' | 'mistakes' | 'extra';

/** Secondary material in one tab strip instead of a stack of collapsible boxes. */
export function GoDeeper({ section }: { section: LessonSection }) {
  const tabs = (
    [
      { id: 'example', label: 'Example', icon: <Sparkles className="h-3.5 w-3.5" />, show: Boolean(section.example) },
      { id: 'why', label: 'Why it matters', icon: <Lightbulb className="h-3.5 w-3.5" />, show: Boolean(section.whyItMatters) },
      { id: 'practice', label: 'In practice', icon: <Play className="h-3.5 w-3.5" />, show: Boolean(section.practicalApplication) },
      { id: 'mistakes', label: 'Common mistakes', icon: <AlertTriangle className="h-3.5 w-3.5" />, show: section.commonMistakes.length > 0 },
      { id: 'extra', label: 'Beyond your notes', icon: <Info className="h-3.5 w-3.5" />, show: section.supplementaryNotes.length > 0 },
    ] as { id: DeepTab; label: string; icon: ReactNode; show: boolean }[]
  ).filter((t) => t.show);
  const [tab, setTab] = useState<DeepTab | null>(null);
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];
  if (!active) return null;
  return (
    <div className="rounded-xl border border-border">
      <div role="tablist" aria-label="Go deeper" className="flex gap-1 overflow-x-auto border-b border-border p-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active.id === t.id}
            onClick={() => setTab(t.id)}
            className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium', active.id === t.id ? 'bg-primary-soft text-primary' : 'text-muted hover:text-text')}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="px-5 py-4 text-sm">
        {active.id === 'example' && <Markdown>{section.example}</Markdown>}
        {active.id === 'why' && <Markdown>{section.whyItMatters}</Markdown>}
        {active.id === 'practice' && <Markdown>{section.practicalApplication}</Markdown>}
        {active.id === 'mistakes' && (
          <ul className="list-disc pl-5 space-y-1">
            {section.commonMistakes.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        {active.id === 'extra' && (
          <>
            <p className="text-xs text-secondary mb-2">Supplementary explanation — not in your notes.</p>
            <ul className="list-disc pl-5 space-y-1">
              {section.supplementaryNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

