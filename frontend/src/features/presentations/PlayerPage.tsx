import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  Captions,
  CaptionsOff,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Pause,
  PanelRight,
  Pencil,
  Play,
  RotateCcw,
  SkipBack,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatMs } from '../../utils/format';
import { SlideStage } from '../../components/presentation/SlideStage';
import { Badge, ErrorState, PageLoader } from '../../components/ui/Feedback';
import { useAuth } from '../auth/AuthContext';
import type { Presentation, Progress } from '../../types/models';
import { PresentationClock, type ClockState } from './clock';
import { captionAt, frameAt } from './frame';
import { SlideEditor } from './SlideEditor';
import { useNarration } from './useNarration';
import { useVoices } from '../../lib/voices';
import { VersionsButton } from './PresentationVersions';

const SPEEDS = [0.75, 1, 1.25, 1.5];

/** Subscribes to a derived value of the clock; re-renders only when that value changes. */
function useClockValue<T>(clock: PresentationClock, select: (s: ClockState) => T): T {
  return useSyncExternalStore(clock.subscribe, () => select(clock.getSnapshot()));
}

function Stage({ clock, presentation, captions }: { clock: PresentationClock; presentation: Presentation; captions: boolean }) {
  // The stage is the only part that renders every animation frame.
  const state = useSyncExternalStore(clock.subscribe, clock.getSnapshot);
  const slide = presentation.manifest.slides[state.slideIndex];
  const diagram = slide?.diagramId ? presentation.manifest.diagrams.find((d) => d.id === slide.diagramId) : undefined;
  if (!slide) return null;
  const frame = frameAt(slide, state.elapsedMs);
  const caption = captions ? captionAt(slide.narration.captions, state.elapsedMs)?.text : undefined;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={slide.id} initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
        <SlideStage slide={slide} diagram={diagram} frame={frame} caption={caption} />
      </motion.div>
    </AnimatePresence>
  );
}

function SidePanel({ clock, presentation, tab, setTab }: { clock: PresentationClock; presentation: Presentation; tab: 'transcript' | 'outline'; setTab: (t: 'transcript' | 'outline') => void }) {
  const slideIndex = useClockValue(clock, (s) => s.slideIndex);
  // Transcript highlight only needs ~4 updates per second.
  const quarter = useClockValue(clock, (s) => Math.floor(s.elapsedMs / 250));
  const elapsed = quarter * 250;
  const slide = presentation.manifest.slides[slideIndex];
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // scrollIntoView returns a Promise in recent browsers; never return it from an effect.
    void activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [slideIndex, tab]);

  return (
    <aside className="rounded-xl border border-border bg-surface flex flex-col min-h-0 max-h-[70vh] lg:max-h-none">
      <div className="flex border-b border-border" role="tablist">
        {(['transcript', 'outline'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('flex-1 py-2.5 text-sm capitalize', tab === t ? 'text-primary border-b-2 border-primary' : 'text-muted')}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
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

function Controls({
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

/** Screen 6 — Animated Presentation Player. */
export function PlayerPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const container = useRef<HTMLDivElement>(null);
  const { data: presentation, isLoading, error, refetch } = useQuery({
    queryKey: ['presentation', id],
    queryFn: async () => (await api.get<{ presentation: Presentation }>(`/lessons/${id}/presentation`)).presentation,
  });
  const { data: progress } = useQuery({
    queryKey: ['lesson-progress', id],
    queryFn: async () => (await api.get<{ progress: Progress }>(`/lessons/${id}/progress`)).progress,
  });

  const [clock, setClock] = useState<PresentationClock | null>(null);
  const [captions, setCaptions] = useState(user?.preferences?.captions ?? true);
  const [muted, setMuted] = useState(user?.preferences?.narrationEnabled === false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(user?.preferences?.playbackSpeed ?? 1);
  const [panel, setPanel] = useState(true);
  const [tab, setTab] = useState<'transcript' | 'outline'>('transcript');
  const [fullscreen, setFullscreen] = useState(false);
  const [editing, setEditing] = useState(false);

  const durations = useMemo(() => presentation?.manifest.slides.map((s) => s.durationMs) ?? [], [presentation]);

  // One clock per presentation; resumes at the last slide viewed.
  useEffect(() => {
    if (!presentation || clock) return;
    const c = new PresentationClock(durations);
    if (progress?.lastSlideViewed && progress.lastSlideViewed < durations.length) c.goTo(progress.lastSlideViewed);
    setClock(c);
  }, [presentation, progress, durations, clock]);
  useEffect(() => {
    clock?.setDurations(durations);
  }, [clock, durations]);
  useEffect(() => () => clock?.destroy(), [clock]);
  useEffect(() => {
    clock?.setSpeed(speed);
  }, [clock, speed]);

  const voices = useVoices();
  useNarration(clock, presentation?.manifest, { enabled: !muted, volume, voices, voiceName: user?.preferences?.narrationVoice });

  // Record real study activity: slide position and time spent while playing.
  const report = useMutation({ mutationFn: (body: Record<string, unknown>) => api.patch(`/lessons/${id}/progress`, body), onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard'] }) });
  useEffect(() => {
    if (!clock) return;
    let lastSlide = clock.getSnapshot().slideIndex;
    let playedMs = 0;
    let last = performance.now();
    const unsubscribe = clock.subscribe(() => {
      const s = clock.getSnapshot();
      const now = performance.now();
      if (s.playing) playedMs += now - last;
      last = now;
      if (s.slideIndex !== lastSlide) {
        lastSlide = s.slideIndex;
        report.mutate({ lastSlideViewed: s.slideIndex });
      }
      if (playedMs >= 60_000) {
        report.mutate({ addTimeSeconds: Math.round(playedMs / 1000) });
        playedMs = 0;
      }
    });
    return () => {
      unsubscribe();
      if (playedMs >= 10_000) report.mutate({ addTimeSeconds: Math.round(playedMs / 1000) });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void container.current?.requestFullscreen?.();
  }, []);
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Keyboard navigation.
  useEffect(() => {
    if (!clock) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable], dialog')) return;
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        clock.toggle();
      } else if (e.key === 'ArrowRight') clock.next();
      else if (e.key === 'ArrowLeft') clock.prev();
      else if (e.key === 'f') toggleFullscreen();
      else if (e.key === 'c') setCaptions((c) => !c);
      else if (e.key === 'm') setMuted((m) => !m);
      else if (e.key === 'Home') clock.goTo(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clock, toggleFullscreen]);

  if (isLoading) return <PageLoader />;
  if (error || !presentation) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!clock) return <PageLoader />;

  const hasAudio = presentation.manifest.slides.some((s) => s.narration.audioAssetId);
  const hasNarration = presentation.manifest.slides.some((s) => s.narration.text);

  return (
    <div ref={container} className={cn('space-y-3', fullscreen && 'bg-bg p-4 h-full overflow-auto')}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 mr-auto">
          <Link to={`/lessons/${id}`} className="text-[13px] text-muted hover:text-text">
            ← Back to lesson
          </Link>
          <h1 className="text-xl font-bold truncate">{presentation.title}</h1>
        </div>
        <Badge>{presentation.manifest.language === 'roman-urdu' ? 'Roman Urdu' : presentation.manifest.language === 'bilingual' ? 'Bilingual' : 'English'}</Badge>
        <Badge tone={hasAudio ? 'success' : hasNarration ? 'primary' : 'default'}>{hasAudio ? 'AI voice' : hasNarration ? 'Browser voice' : 'No narration'}</Badge>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed" className="h-9 rounded-lg border border-border bg-surface px-2 text-sm">
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
        <button className="p-2 rounded-lg hover:bg-surface-2" onClick={() => setCaptions(!captions)} aria-label={captions ? 'Hide captions' : 'Show captions'} aria-pressed={captions} title="Captions (C)">
          {captions ? <Captions className="h-5 w-5" /> : <CaptionsOff className="h-5 w-5" />}
        </button>
        <button className="p-2 rounded-lg hover:bg-surface-2" onClick={() => setPanel(!panel)} aria-label="Toggle transcript panel" aria-pressed={panel}>
          <PanelRight className="h-5 w-5" />
        </button>
        {!fullscreen && (
          <>
            <button className="p-2 rounded-lg hover:bg-surface-2" onClick={() => (clock.pause(), setEditing(true))} aria-label="Edit slides" title="Edit slides">
              <Pencil className="h-5 w-5" />
            </button>
            <VersionsButton presentation={presentation} onRestored={() => refetch()} />
          </>
        )}
        <button className="p-2 rounded-lg hover:bg-surface-2" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} title="Fullscreen (F)">
          {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
        </button>
      </div>

      <div className={cn('grid gap-3', panel && 'lg:grid-cols-[minmax(0,1fr)_320px]')}>
        <div className="space-y-3 min-w-0">
          <div onClick={() => clock.toggle()} className="cursor-pointer" role="presentation">
            <Stage clock={clock} presentation={presentation} captions={captions} />
          </div>
          <Controls clock={clock} presentation={presentation} muted={muted} setMuted={setMuted} volume={volume} setVolume={setVolume} />
        </div>
        {panel && <SidePanel clock={clock} presentation={presentation} tab={tab} setTab={setTab} />}
      </div>
      {editing && <SlideEditor presentation={presentation} onClose={() => setEditing(false)} onSaved={(p) => qc.setQueryData(['presentation', id], p)} />}
    </div>
  );
}
