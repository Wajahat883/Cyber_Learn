import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Captions, CaptionsOff, Maximize, Minimize, PanelRight, Pencil } from 'lucide-react';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Badge, ErrorState, PageLoader } from '../../components/ui/Feedback';
import { useAuth } from '../auth/AuthContext';
import type { Presentation } from '../../types/models';
import { useLessonProgress } from '../lessons/useLesson';
import { PresentationClock } from './clock';
import { SlideEditor } from './SlideEditor';
import { useNarration } from './useNarration';
import { useVoices } from '../../lib/voices';
import { VersionsButton } from './PresentationVersions';
import { PlayerControls } from './PlayerControls';
import { PlayerStage } from './PlayerStage';
import { SidePanel } from './SidePanel';

const SPEEDS = [0.75, 1, 1.25, 1.5];

/**
 * Screen 6 — Animated Presentation Player.
 * Keyed by lesson id so moving to another lesson's presentation starts with a fresh clock.
 */
export function PlayerPage() {
  const { id } = useParams();
  return <Player key={id} id={id} />;
}

function Player({ id }: { id: string | undefined }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const container = useRef<HTMLDivElement>(null);
  const { data: presentation, isLoading, error, refetch } = useQuery({
    queryKey: ['presentation', id],
    queryFn: async () => (await api.get<{ presentation: Presentation }>(`/lessons/${id}/presentation`)).presentation,
  });
  const { data: progress, isPending: progressPending } = useLessonProgress(id);

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

  // One clock per presentation; resumes at the last slide viewed. Waits until the progress
  // request has settled (success or error) so a slow response cannot be ignored.
  useEffect(() => {
    if (!presentation || clock || progressPending) return;
    const c = new PresentationClock(durations);
    if (progress?.lastSlideViewed && progress.lastSlideViewed < durations.length) c.goTo(progress.lastSlideViewed);
    setClock(c);
  }, [presentation, progress, progressPending, durations, clock]);
  useEffect(() => {
    clock?.setDurations(durations);
  }, [clock, durations]);
  useEffect(() => () => clock?.destroy(), [clock]);
  useEffect(() => {
    clock?.setSpeed(speed);
  }, [clock, speed]);

  const voices = useVoices();
  const narration = useNarration(clock, presentation?.manifest, { enabled: !muted, volume, voices, voiceName: user?.preferences?.narrationVoice });
  const [selected, setSelected] = useState<string | null>(null);

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
          <div onClick={() => (setSelected(null), clock.toggle())} className="cursor-pointer" role="presentation">
            <PlayerStage clock={clock} presentation={presentation} captions={captions} narration={narration} voiceOn={!muted} selected={selected} onSelect={setSelected} />
          </div>
          <PlayerControls clock={clock} presentation={presentation} muted={muted} setMuted={setMuted} volume={volume} setVolume={setVolume} />
        </div>
        {panel && <SidePanel clock={clock} presentation={presentation} tab={tab} setTab={setTab} />}
      </div>
      {editing && <SlideEditor presentation={presentation} onClose={() => setEditing(false)} onSaved={(p) => qc.setQueryData(['presentation', id], p)} />}
    </div>
  );
}
