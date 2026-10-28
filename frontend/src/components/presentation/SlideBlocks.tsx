import type { Slide } from '@cyberlearn/shared';
import { assetUrl } from '../../lib/api';
import type { SlideFrame } from '../../features/presentations/frame';
import { appear, reducedMotion } from './slideStyle';

export function Terminal({ slide, frame }: { slide: Slide; frame: SlideFrame }) {
  return (
    <div className="mt-8 rounded-2xl border border-border bg-[#070b16] overflow-hidden font-mono">
      <div className="flex gap-2 px-4 py-3 border-b border-border">
        <span className="h-3 w-3 rounded-full bg-error" />
        <span className="h-3 w-3 rounded-full bg-warning" />
        <span className="h-3 w-3 rounded-full bg-success" />
      </div>
      <div className="p-6 space-y-5 text-[19px] max-h-[470px] overflow-hidden">
        {slide.terminal.map((t) => {
          const amount = frame.reveal.get(t.id);
          if (amount <= 0) return null;
          // Commands are "typed" in proportion to the reveal progress.
          const typed = t.command.slice(0, Math.ceil(t.command.length * Math.min(1, amount * 1.4)));
          return (
            <div key={t.id} style={{ opacity: frame.dimmed.has(t.id) ? 0.4 : 1 }}>
              <p className="whitespace-pre-wrap break-all">
                <span className="text-success">$ </span>
                <span className={frame.highlighted.has(t.id) ? 'text-primary' : 'text-text'}>{typed}</span>
                {amount < 0.75 && <span className="animate-pulse">▋</span>}
              </p>
              {t.output && amount >= 0.75 && <p className="text-muted whitespace-pre-wrap mt-2 text-[16px]">{t.output}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Timeline({ slide, frame }: { slide: Slide; frame: SlideFrame }) {
  return (
    <div className="mt-16 relative">
      <div className="absolute left-0 right-0 top-[22px] h-1 rounded bg-border" />
      <ol className="relative grid gap-6" style={{ gridTemplateColumns: `repeat(${Math.max(1, slide.timeline.length)}, minmax(0, 1fr))` }}>
        {slide.timeline.map((t) => (
          <li key={t.id} style={appear(frame.reveal.get(t.id), frame.highlighted.has(t.id))} className="rounded-xl border border-transparent p-2">
            <span className="block h-12 w-12 rounded-full border-4 border-bg bg-secondary shadow-[0_0_18px_#8B5CF6]" />
            <p className="text-secondary text-[16px] font-semibold mt-3">{t.time}</p>
            <p className="text-[19px] leading-snug mt-1">{t.label}</p>
            {t.detail && <p className="text-muted text-[15px] mt-1">{t.detail}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Comparison({ slide, frame }: { slide: Slide; frame: SlideFrame }) {
  if (!slide.comparison) return null;
  const side = (s: NonNullable<Slide['comparison']>['left'], color: string) => (
    <div className="rounded-2xl border-2 p-6" style={{ ...appear(frame.reveal.get(s.id), frame.highlighted.has(s.id)), borderColor: color }}>
      <h3 className="text-[28px] font-bold mb-5" style={{ color }}>
        {s.title}
      </h3>
      <ul className="space-y-4">
        {s.points.map((p) => (
          <li key={p.id} className="text-[20px] leading-snug rounded-lg border border-transparent px-2 py-1" style={appear(frame.reveal.get(p.id), frame.highlighted.has(p.id))}>
            {p.text}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="mt-8 grid grid-cols-2 gap-8">
      {side(slide.comparison.left, '#34D399')}
      {side(slide.comparison.right, '#F87171')}
    </div>
  );
}

export function Illustration({ slide, frame }: { slide: Slide; frame: SlideFrame }) {
  return (
    <div className="mt-6 relative h-[520px] rounded-2xl overflow-hidden border border-border bg-bg" style={{ opacity: frame.reveal.get('image') }}>
      {slide.imageAssetId && (
        // Slow push-in, like a documentary camera.
        <img src={assetUrl(slide.imageAssetId)} alt={slide.imageAlt} className="w-full h-full object-cover" style={{ transform: reducedMotion() ? undefined : `scale(${1 + 0.07 * frame.progress})` }} draggable={false} />
      )}
      {/* Labels are HTML overlays so exact technical wording is never baked into a generated image. */}
      {slide.annotations.map((a) => (
        <span
          key={a.id}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/60 bg-bg/85 px-4 py-2 text-[18px] font-semibold text-text backdrop-blur"
          style={{ left: `${a.x}%`, top: `${a.y}%`, ...appear(frame.reveal.get(a.id), frame.highlighted.has(a.id)) }}
        >
          {a.label}
        </span>
      ))}
    </div>
  );
}

