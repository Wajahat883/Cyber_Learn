import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';
import type { Presentation } from '../../types/models';
import type { PresentationClock } from './clock';
import { useClockValue } from './useClockValue';

type PanelTab = 'transcript' | 'outline';
const TABS: PanelTab[] = ['transcript', 'outline'];

export function SidePanel({ clock, presentation, tab, setTab }: { clock: PresentationClock; presentation: Presentation; tab: PanelTab; setTab: (t: PanelTab) => void }) {
  const slideIndex = useClockValue(clock, (s) => s.slideIndex);
  // Transcript highlight only needs ~4 updates per second.
  const quarter = useClockValue(clock, (s) => Math.floor(s.elapsedMs / 250));
  const elapsed = quarter * 250;
  const slide = presentation.manifest.slides[slideIndex];
  const activeRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<Partial<Record<PanelTab, HTMLButtonElement | null>>>({});
  const baseId = useId();
  const tabId = (t: PanelTab) => `${baseId}-tab-${t}`;
  const panelId = `${baseId}-panel`;
  // Arrow keys move between tabs (automatic activation), as in the WAI-ARIA tabs pattern.
  const onTabKey = (e: KeyboardEvent) => {
    const at = TABS.indexOf(tab);
    const next = e.key === 'ArrowRight' ? (at + 1) % TABS.length : e.key === 'ArrowLeft' ? (at - 1 + TABS.length) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    e.stopPropagation(); // the player maps ←/→ to slide navigation; don't change slides here
    setTab(TABS[next]);
    tabRefs.current[TABS[next]]?.focus();
  };
  useEffect(() => {
    // scrollIntoView returns a Promise in recent browsers; never return it from an effect.
    void activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [slideIndex, tab]);

  return (
    <aside className="rounded-xl border border-border bg-surface flex flex-col min-h-0 max-h-[70vh] lg:max-h-none">
      <div className="flex border-b border-border" role="tablist" aria-label="Presentation panel" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t}
            ref={(el) => void (tabRefs.current[t] = el)}
            id={tabId(t)}
            role="tab"
            aria-selected={tab === t}
            aria-controls={panelId}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
            className={cn('flex-1 py-2.5 text-sm capitalize', tab === t ? 'text-primary border-b-2 border-primary' : 'text-muted')}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4" id={panelId} role="tabpanel" aria-labelledby={tabId(tab)}>
        {tab === 'transcript' ? (
          slide?.narration.captions.length ? (
            <div className="space-y-2 text-sm leading-relaxed">
              {slide.narration.captions.map((c, i) => {
                const active = elapsed >= c.startMs && elapsed < c.endMs;
                return (
                  <button key={i} onClick={() => clock.seek(c.startMs)} className={cn('block text-left rounded px-1 -mx-1 transition-colors', active ? 'bg-primary/15 text-text' : 'text-muted hover:text-text')}>
                    {c.text}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted">{slide?.speakerNotes || 'No narration for this slide.'}</p>
          )
        ) : (
          <ol className="space-y-1">
            {presentation.manifest.slides.map((s, i) => (
              <li key={s.id}>
                <button
                  ref={i === slideIndex ? activeRef : undefined}
                  onClick={() => clock.goTo(i)}
                  className={cn('w-full text-left text-sm rounded-lg px-2 py-1.5 flex gap-2', i === slideIndex ? 'bg-primary/10 text-primary' : 'hover:bg-surface-2')}
                >
                  <span className="text-muted w-6 shrink-0">{i + 1}</span>
                  <span className="flex-1">{s.title}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}

