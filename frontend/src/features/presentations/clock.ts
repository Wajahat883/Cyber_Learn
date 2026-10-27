/**
 * Presentation clock (spec 4.8): one source of time for a slide. Animations are
 * computed from `elapsedMs`, never from independent timers, so pause, resume,
 * seek and playback speed always stay consistent. Lives outside React state;
 * components subscribe and pick the update rate they need.
 */
export interface ClockState {
  slideIndex: number;
  elapsedMs: number;
  playing: boolean;
  speed: number;
  ended: boolean;
}

type Listener = () => void;

export class PresentationClock {
  private state: ClockState = { slideIndex: 0, elapsedMs: 0, playing: false, speed: 1, ended: false };
  private listeners = new Set<Listener>();
  private frame: number | null = null;
  private lastTs: number | null = null;
  /** Narration can hold the clock (e.g. browser speech still talking) to keep visuals in sync. */
  holdAt: ((slideIndex: number, elapsedMs: number) => boolean) | null = null;

  constructor(
    private durations: number[],
    private readonly now: () => number = () => performance.now(),
    private readonly raf: (cb: (ts: number) => void) => number = (cb) => requestAnimationFrame(cb),
    private readonly caf: (id: number) => void = (id) => cancelAnimationFrame(id),
  ) {}

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  get slideCount() {
    return this.durations.length;
  }

  durationOf(index = this.state.slideIndex) {
    return this.durations[index] ?? 0;
  }

  setDurations(durations: number[]) {
    this.durations = durations;
    if (this.state.slideIndex >= durations.length) this.set({ slideIndex: Math.max(0, durations.length - 1), elapsedMs: 0 });
  }

  private set(patch: Partial<ClockState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private loop = (ts: number) => {
    const last = this.lastTs ?? ts;
    this.lastTs = ts;
    this.advance(ts - last);
    if (this.state.playing) this.frame = this.raf(this.loop);
  };

  /** Advances the clock by real milliseconds, scaled by playback speed. Exposed for tests. */
  advance(realMs: number) {
    if (!this.state.playing) return;
    const { slideIndex, elapsedMs, speed } = this.state;
    if (this.holdAt?.(slideIndex, elapsedMs)) return;
    const next = elapsedMs + realMs * speed;
    const duration = this.durationOf(slideIndex);
    if (next < duration) {
      this.set({ elapsedMs: next });
    } else if (slideIndex + 1 < this.durations.length) {
      this.set({ slideIndex: slideIndex + 1, elapsedMs: 0 });
    } else {
      this.stopLoop();
      this.set({ elapsedMs: duration, playing: false, ended: true });
    }
  }

  private stopLoop() {
    if (this.frame !== null) this.caf(this.frame);
    this.frame = null;
    this.lastTs = null;
  }

  play() {
    if (this.state.playing) return;
    if (this.state.ended) this.set({ slideIndex: 0, elapsedMs: 0, ended: false });
    this.set({ playing: true });
    this.lastTs = null;
    this.frame = this.raf(this.loop);
  }

  pause() {
    this.stopLoop();
    this.set({ playing: false });
  }

  toggle() {
    if (this.state.playing) this.pause();
    else this.play();
  }

  seek(elapsedMs: number) {
    this.set({ elapsedMs: Math.max(0, Math.min(elapsedMs, this.durationOf())), ended: false });
  }

  goTo(slideIndex: number) {
    const index = Math.max(0, Math.min(slideIndex, this.durations.length - 1));
    this.set({ slideIndex: index, elapsedMs: 0, ended: false });
  }

  next() {
    if (this.state.slideIndex + 1 < this.durations.length) this.goTo(this.state.slideIndex + 1);
  }

  prev() {
    // Like media players: restart the slide unless we are at its very beginning.
    if (this.state.elapsedMs > 1500 || this.state.slideIndex === 0) this.seek(0);
    else this.goTo(this.state.slideIndex - 1);
  }

  replaySlide() {
    this.seek(0);
    this.play();
  }

  restart() {
    this.goTo(0);
    this.play();
  }

  setSpeed(speed: number) {
    this.set({ speed });
  }

  destroy() {
    this.stopLoop();
    this.listeners.clear();
  }
}
