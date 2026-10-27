import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

const STEPS = ['Add material', 'Review plan', 'Generate', 'Learn'];

/** The lesson-creation journey, shown on every screen of the flow so it is clear where you are. */
export function Steps({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Lesson creation steps">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span
            className={cn(
              'h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold',
              i < current ? 'bg-primary text-primary-fg' : i === current ? 'bg-primary-soft text-primary ring-1 ring-primary/40' : 'bg-surface-2 text-muted',
            )}
            aria-current={i === current ? 'step' : undefined}
          >
            {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span className={i === current ? 'font-medium text-text' : 'text-muted hidden md:inline'}>{label}</span>
          {i < STEPS.length - 1 && <span className="w-5 md:w-8 h-px bg-border" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}
