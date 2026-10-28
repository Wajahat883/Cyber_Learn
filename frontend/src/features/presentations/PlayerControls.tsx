import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, SkipBack, Volume2, VolumeX } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatMs } from '../../utils/format';
import type { Presentation } from '../../types/models';
import type { PresentationClock } from './clock';
import { useClockValue } from './useClockValue';

export function PlayerControls({
  clock,
  presentation,
  muted,
  setMuted,
  volume,
  setVolume,
}: {
  clock: PresentationClock;
  presentation: Presentation;
  muted: boolean;
  setMuted: (m: boolean) => void;
  volume: number;
  setVolume: (v: number) => void;
}) {
  const playing = useClockValue(clock, (s) => s.playing);
  const slideIndex = useClockValue(clock, (s) => s.slideIndex);
  const tenth = useClockValue(clock, (s) => Math.floor(s.elapsedMs / 100));
  const duration = clock.durationOf(slideIndex);
  const slides = presentation.manifest.slides;
  return (
    <div className="rounded-xl border border-border bg-surface p-3 space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted tabular-nums w-10 text-right">{formatMs(tenth * 100)}</span>
        <input
          type="range"
          min={0}
          max={duration}
          step={100}
          value={Math.min(tenth * 100, duration)}
          onChange={(e) => clock.seek(Number(e.target.value))}
          aria-label="Seek within slide"
          className="flex-1 accent-[var(--color-primary)]"
        />
        <span className="text-xs text-muted tabular-nums w-10">{formatMs(duration)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button className="p-2 rounded-lg hover:bg-surface-2" onClick={() => clock.restart()} aria-label="Restart presentation" title="Restart presentation">
          <SkipBack className="h-5 w-5" />
        </button>
        <button className="p-2 rounded-lg hover:bg-surface-2" onClick={() => clock.prev()} aria-label="Previous slide" title="Previous (←)">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button className="p-3 rounded-full bg-primary text-primary-fg hover:brightness-110 shadow-card" onClick={() => clock.toggle()} aria-label={playing ? 'Pause' : 'Play'} title="Play/Pause (Space)">
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <button className="p-2 rounded-lg hover:bg-surface-2" onClick={() => clock.next()} aria-label="Next slide" title="Next (→)">
          <ChevronRight className="h-5 w-5" />
        </button>
        <button className="p-2 rounded-lg hover:bg-surface-2" onClick={() => clock.replaySlide()} aria-label="Replay current slide" title="Replay slide">
          <RotateCcw className="h-5 w-5" />
        </button>
        <span className="text-sm text-muted ml-2">
          Slide {slideIndex + 1} / {slides.length}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button className="p-2 rounded-lg hover:bg-surface-2" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute narration' : 'Mute narration'} title="Mute (M)">
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => (setVolume(Number(e.target.value)), setMuted(false))} aria-label="Volume" className="w-24 accent-[var(--color-primary)]" />
        </div>
      </div>
      {/* Slide timeline: jump to any slide. */}
      <div className="flex gap-1 overflow-x-auto pb-1" role="list" aria-label="Slide timeline">
        {slides.map((s, i) => (
          <button
            key={s.id}
            role="listitem"
            onClick={() => clock.goTo(i)}
            title={`${i + 1}. ${s.title}`}
            aria-label={`Go to slide ${i + 1}: ${s.title}`}
            className={cn('h-2 min-w-6 flex-1 rounded-full transition-colors', i < slideIndex ? 'bg-primary/60' : i === slideIndex ? 'bg-primary' : 'bg-border hover:bg-muted')}
          />
        ))}
      </div>
    </div>
  );
}

