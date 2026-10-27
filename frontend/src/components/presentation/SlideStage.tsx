import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { DiagramSpec, Slide } from '@cyberlearn/shared';
import { assetUrl } from '../../lib/api';
import { layoutDiagram } from '../../lib/diagramLayout';
import { DiagramSvg } from '../diagrams/DiagramSvg';
import type { SlideFrame } from '../../features/presentations/frame';

const W = 1280;
const H = 720;

/** Opacity/offset style for an element at its reveal progress. */
function appear(amount: number, highlighted = false, dimmed = false): CSSProperties {
  return {
    opacity: dimmed ? 0.35 : amount,
    transform: `translateY(${(1 - amount) * 18}px)`,
    transition: 'box-shadow 300ms, border-color 300ms, background-color 300ms',
    ...(highlighted ? { boxShadow: '0 0 0 2px #38BDF8, 0 0 28px rgba(56,189,248,0.45)', borderColor: '#38BDF8', backgroundColor: 'rgba(56,189,248,0.08)' } : {}),
  };
}

function Title({ slide, frame, big }: { slide: Slide; frame: SlideFrame; big?: boolean }) {
  return (
    <div style={appear(frame.reveal.get('title'))}>
      <h2 className={big ? 'text-[64px] font-bold leading-tight tracking-tight' : 'text-[40px] font-bold leading-tight'}>{slide.title}</h2>
      {slide.subtitle && <p className={big ? 'text-[24px] text-muted mt-4 max-w-[900px]' : 'text-[20px] text-muted mt-2 max-w-[1050px] line-clamp-2'}>{slide.subtitle}</p>}
    </div>
  );
}

function Bullets({ slide, frame }: { slide: Slide; frame: SlideFrame }) {
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

function DiagramStage({ diagram, frame }: { diagram: DiagramSpec; frame: SlideFrame }) {
  const layout = useMemo(() => layoutDiagram(diagram), [diagram]);
  const reveal = new Map<string, number>();
  const visible = new Set<string>();
  for (const id of [...diagram.nodes.map((n) => n.id), ...diagram.edges.map((e) => e.id)]) {
    const amount = frame.reveal.get(id);
    reveal.set(id, amount);
    if (amount > 0) visible.add(id);
  }
  return (
    <div className="mt-6 h-[520px] rounded-2xl border border-border bg-[#0d1528] p-4">
      <DiagramSvg diagram={diagram} layout={layout} frame={{ reveal, visible, highlighted: frame.highlighted, tokens: frame.tokens }} />
    </div>
  );
}

function Terminal({ slide, frame }: { slide: Slide; frame: SlideFrame }) {
  return (
    <div className="mt-8 rounded-2xl border border-border bg-[#05080f] overflow-hidden font-mono">
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

function Timeline({ slide, frame }: { slide: Slide; frame: SlideFrame }) {
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

function Comparison({ slide, frame }: { slide: Slide; frame: SlideFrame }) {
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

function Illustration({ slide, frame }: { slide: Slide; frame: SlideFrame }) {
  return (
    <div className="mt-6 relative h-[520px] rounded-2xl overflow-hidden border border-border bg-bg" style={{ opacity: frame.reveal.get('image') }}>
      {slide.imageAssetId && <img src={assetUrl(slide.imageAssetId)} alt={slide.imageAlt} className="w-full h-full object-cover" draggable={false} />}
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

function SlideBody({ slide, diagram, frame }: { slide: Slide; diagram?: DiagramSpec; frame: SlideFrame }): ReactNode {
  switch (slide.type) {
    case 'title':
      return (
        <div className="h-full grid grid-cols-[1fr_auto] gap-10 items-center">
          <div>
            <p className="text-primary uppercase tracking-[0.3em] text-[16px] mb-6" style={appear(frame.reveal.get('title'))}>
              CyberLearn AI
            </p>
            <Title slide={slide} frame={frame} big />
            <Bullets slide={slide} frame={frame} />
          </div>
          {slide.imageAssetId && (
            <img src={assetUrl(slide.imageAssetId)} alt={slide.imageAlt} className="w-[440px] rounded-2xl border border-border" style={{ opacity: frame.reveal.get('image') }} draggable={false} />
          )}
        </div>
      );
    case 'progressive-diagram':
    case 'data-flow':
    case 'decision-flow':
      return (
        <>
          <Title slide={slide} frame={frame} />
          {diagram ? <DiagramStage diagram={diagram} frame={frame} /> : <Bullets slide={slide} frame={frame} />}
        </>
      );
    case 'terminal':
      return (
        <>
          <Title slide={slide} frame={frame} />
          <Terminal slide={slide} frame={frame} />
        </>
      );
    case 'timeline':
      return (
        <>
          <Title slide={slide} frame={frame} />
          <Timeline slide={slide} frame={frame} />
        </>
      );
    case 'comparison':
      return (
        <>
          <Title slide={slide} frame={frame} />
          <Comparison slide={slide} frame={frame} />
        </>
      );
    case 'concept-illustration':
      return (
        <>
          <Title slide={slide} frame={frame} />
          <Illustration slide={slide} frame={frame} />
        </>
      );
    default:
      return (
        <>
          <Title slide={slide} frame={frame} />
          <Bullets slide={slide} frame={frame} />
        </>
      );
  }
}

/** 16:9 slide canvas, laid out at 1280×720 and scaled to fit its container. */
export function SlideStage({ slide, diagram, frame, caption }: { slide: Slide; diagram?: DiagramSpec; frame: SlideFrame; caption?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / W));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative w-full aspect-video overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_top_left,#16244a,#0b1020_60%)] select-none" aria-roledescription="slide" aria-label={slide.title}>
      <div className="absolute left-0 top-0 origin-top-left text-text" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        <div className="h-full px-16 py-12">
          <SlideBody slide={slide} diagram={diagram} frame={frame} />
        </div>
      </div>
      {caption && (
        <div className="absolute inset-x-0 bottom-[4%] flex justify-center px-[6%] pointer-events-none" aria-live="polite">
          <p className="rounded-lg bg-black/75 px-4 py-2 text-center text-white" style={{ fontSize: `${Math.max(12, 22 * scale)}px` }}>
            {caption}
          </p>
        </div>
      )}
    </div>
  );
}
