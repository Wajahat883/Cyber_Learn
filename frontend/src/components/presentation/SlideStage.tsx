import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DiagramSpec, Slide } from '@cyberlearn/shared';
import { assetUrl } from '../../lib/api';
import type { SlideFrame } from '../../features/presentations/frame';
import { DiagramStage } from './DiagramStage';
import { Comparison, Illustration, Terminal, Timeline } from './SlideBlocks';
import { appear, H, W, type StageInteraction } from './slideStyle';
import { Bullets, Spotlight, Title } from './SlideText';
import { WordCaption } from './WordCaption';

export type { StageInteraction } from './slideStyle';

function SlideBody({ slide, diagram, frame, interaction }: { slide: Slide; diagram?: DiagramSpec; frame: SlideFrame; interaction?: StageInteraction }): ReactNode {
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
          {diagram ? <DiagramStage slide={slide} diagram={diagram} frame={frame} interaction={interaction} /> : <Spotlight slide={slide} frame={frame} />}
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
          <Spotlight slide={slide} frame={frame} />
        </>
      );
  }
}

/** 16:9 slide canvas, laid out at 1280×720 and scaled to fit its container. */
export function SlideStage({
  slide,
  diagram,
  frame,
  caption,
  interaction,
  overlay,
}: {
  slide: Slide;
  diagram?: DiagramSpec;
  frame: SlideFrame;
  caption?: { text: string; word: number };
  interaction?: StageInteraction;
  /** Rendered on top of the canvas at screen scale (e.g. the narration waveform). */
  overlay?: ReactNode;
}) {
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
    <div ref={ref} className="theme-dark relative w-full aspect-video overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_top_left,#16244a,#0b1020_60%)] select-none" aria-roledescription="slide" aria-label={slide.title}>
      <div className="absolute left-0 top-0 origin-top-left text-text" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        <div className="h-full px-16 py-12">
          <SlideBody slide={slide} diagram={diagram} frame={frame} interaction={interaction} />
        </div>
      </div>
      {overlay}
      {caption && (
        <div className="absolute inset-x-0 bottom-[4%] flex justify-center px-[6%] pointer-events-none" aria-live="polite">
          <WordCaption text={caption.text} word={caption.word} scale={scale} />
        </div>
      )}
    </div>
  );
}
