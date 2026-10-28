import type { Slide } from '@cyberlearn/shared';
import { iconFor } from '../diagrams/securityIcons';
import type { SlideFrame } from '../../features/presentations/frame';
import { appear } from './slideStyle';

export function Title({ slide, frame, big }: { slide: Slide; frame: SlideFrame; big?: boolean }) {
  return (
    <div style={appear(frame.reveal.get('title'))}>
      <h2 className={big ? 'text-[64px] font-bold leading-tight tracking-tight' : 'text-[40px] font-bold leading-tight'}>{slide.title}</h2>
      {slide.subtitle && <p className={big ? 'text-[24px] text-muted mt-4 max-w-[900px]' : 'text-[20px] text-muted mt-2 max-w-[1050px] line-clamp-2'}>{slide.subtitle}</p>}
    </div>
  );
}

export function Bullets({ slide, frame }: { slide: Slide; frame: SlideFrame }) {
  return (
    <ul className="mt-10 space-y-5">
      {slide.bullets.map((b) => (
        <li key={b.id} className="flex gap-4 rounded-xl border border-transparent px-4 py-3 text-[24px] leading-snug" style={appear(frame.reveal.get(b.id), frame.highlighted.has(b.id), frame.dimmed.has(b.id))}>
          <span className="mt-3 h-3 w-3 shrink-0 rounded-full bg-primary shadow-[0_0_12px_#38BDF8]" />
          <span>{b.text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Spotlight cards: one card per point; the point being narrated is lifted and lit,
 * the others step back, so the eye always knows where to look.
 */
export function Spotlight({ slide, frame }: { slide: Slide; frame: SlideFrame }) {
  const items = slide.bullets;
  const current = items.find((b) => frame.highlighted.has(b.id))?.id ?? (items.some((b) => b.id === frame.latest) ? frame.latest : null);
  const cols = items.length <= 3 ? Math.max(1, items.length) : items.length === 4 ? 2 : 3;
  const tall = items.length <= 3;
  return (
    <ol className="mt-10 grid gap-5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {items.map((b, i) => {
        const amount = frame.reveal.get(b.id);
        const on = current === b.id;
        const Icon = iconFor(b.text);
        return (
          <li
            key={b.id}
            className="relative rounded-2xl border px-6 py-5 overflow-hidden"
            style={{
              opacity: frame.dimmed.has(b.id) ? 0.3 : amount * (current && !on ? 0.5 : 1),
              transform: `translateY(${(1 - amount) * 24}px) scale(${on ? 1.03 : 1})`,
              transition: 'transform 450ms cubic-bezier(.2,.8,.2,1), opacity 450ms, border-color 300ms, box-shadow 300ms',
              borderColor: on ? '#38BDF8' : '#263449',
              background: on ? 'linear-gradient(160deg, rgba(56,189,248,0.16), rgba(15,24,48,0.95) 55%)' : 'rgba(15,24,48,0.85)',
              boxShadow: on ? '0 0 0 1px #38BDF8, 0 18px 50px -12px rgba(56,189,248,0.55)' : 'none',
              minHeight: tall ? 260 : undefined,
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="grid h-12 w-12 place-items-center rounded-xl" style={{ background: on ? '#38BDF8' : 'rgba(56,189,248,0.14)', color: on ? '#0b1020' : '#38BDF8' }}>
                <Icon className="h-6 w-6" />
              </span>
              <span className="font-mono text-[18px] tracking-widest" style={{ color: on ? '#38BDF8' : '#64748b' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
            </div>
            <p className={tall ? 'text-[25px] leading-snug' : 'text-[21px] leading-snug'}>{b.text}</p>
            {on && <span className="absolute left-0 bottom-0 h-1 bg-primary" style={{ width: `${Math.round(frame.progress * 100)}%`, transition: 'width 120ms linear' }} />}
          </li>
        );
      })}
    </ol>
  );
}

