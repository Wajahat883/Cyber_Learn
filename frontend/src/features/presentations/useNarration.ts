import { useEffect, useRef } from 'react';
import type { PresentationManifest } from '@cyberlearn/shared';
import { assetUrl } from '../../lib/api';
import { pickVoice } from '../../lib/voices';
import type { PresentationClock } from './clock';

/** What the narrator is saying right now; read by the captions and the waveform every frame. */
export interface SpokenWord {
  slide: number;
  caption: number;
  /** Character range of the current word inside the caption text (browser speech). */
  charStart: number;
  charEnd: number;
  at: number;
}

export interface NarrationHandle {
  /** Current word from browser speech boundary events, if any. */
  word: SpokenWord | null;
  /** Audio levels 0..1 (16 bands) for the waveform: real levels for stored audio, null otherwise. */
  levels: () => number[] | null;
  /** True while a voice is actually producing sound. */
  speaking: () => boolean;
}

/**
 * Keeps narration and animation on one timeline (spec 4.8):
 * - stored TTS audio follows the clock (seek, pause, speed) and holds it while buffering;
 * - otherwise each caption is spoken by the browser's natural voice when the clock reaches it,
 *   word boundaries drive word-by-word captions, and the clock waits at the next caption
 *   until the voice has finished.
 */
export function useNarration(
  clock: PresentationClock | null,
  manifest: PresentationManifest | undefined,
  options: { enabled: boolean; volume: number; voiceName?: string; voices: SpeechSynthesisVoice[] },
): NarrationHandle {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spoken = useRef<{ slide: number; caption: number } | null>(null);
  const opts = useRef(options);
  opts.current = options;
  const handle = useRef<NarrationHandle>({ word: null, levels: () => null, speaking: () => false });

  useEffect(() => {
    if (!clock || !manifest) return;
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;
    const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    let lastSlide = -1;
    let lastPlaying = false;
    let lastElapsed = 0;

    // Real waveform for stored audio (same-origin, so it can be analysed).
    let analyser: AnalyserNode | null = null;
    let bins: Uint8Array<ArrayBuffer> | null = null;
    const ensureAnalyser = () => {
      if (analyser || typeof AudioContext === 'undefined') return;
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaElementSource(audio);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        bins = new Uint8Array(analyser.frequencyBinCount);
        void ctx.resume();
      } catch {
        analyser = null;
      }
    };
    handle.current.levels = () => {
      if (!analyser || !bins || audio.paused) return null;
      analyser.getByteFrequencyData(bins);
      return Array.from({ length: 16 }, (_, i) => bins![Math.min(bins!.length - 1, i + 1)] / 255);
    };
    handle.current.speaking = () => (!audio.paused && !audio.ended) || Boolean(synth?.speaking);

    const stopSpeech = () => {
      synth?.cancel();
      spoken.current = null;
      handle.current.word = null;
    };

    // Never hold longer than this, so a stuck or missing speech engine cannot freeze the slides.
    const MAX_HOLD_MS = 6000;
    let holdingSince: number | null = null;
    const hold = (want: boolean) => {
      if (!want) {
        holdingSince = null;
        return false;
      }
      holdingSince ??= performance.now();
      if (performance.now() - holdingSince > MAX_HOLD_MS) {
        synth?.cancel();
        return false;
      }
      return true;
    };

    const shouldHold = (slideIndex: number, elapsedMs: number) => {
      if (!opts.current.enabled) return false;
      const slide = manifest.slides[slideIndex];
      if (!slide) return false;
      if (slide.narration.audioAssetId) {
        // Audio is buffering or behind: wait for it.
        return !audio.paused && !audio.ended && audio.currentTime * 1000 < elapsedMs - 400;
      }
      if (!synth?.speaking) return false;
      const next = slide.narration.captions.find((c) => c.startMs > (slide.narration.captions[spoken.current?.caption ?? -1]?.startMs ?? -1));
      return Boolean(next && elapsedMs >= next.startMs);
    };
    clock.holdAt = (slideIndex, elapsedMs) => hold(shouldHold(slideIndex, elapsedMs));

    const sync = () => {
      const { slideIndex, elapsedMs, playing, speed } = clock.getSnapshot();
      const slide = manifest.slides[slideIndex];
      const enabled = opts.current.enabled;
      const jumped = slideIndex !== lastSlide || Math.abs(elapsedMs - lastElapsed) > 1000;

      // ---- stored audio
      if (slide?.narration.audioAssetId && enabled) {
        const src = assetUrl(slide.narration.audioAssetId);
        if (!audio.src.endsWith(src)) audio.src = src;
        audio.playbackRate = speed;
        audio.volume = opts.current.volume;
        if (jumped || Math.abs(audio.currentTime * 1000 - elapsedMs) > 700) audio.currentTime = elapsedMs / 1000;
        if (playing && audio.paused && elapsedMs / 1000 < (audio.duration || Infinity)) {
          ensureAnalyser();
          void audio.play().catch(() => undefined);
        }
        if (!playing && !audio.paused) audio.pause();
      } else if (!audio.paused) {
        audio.pause();
      }

      // ---- browser speech (natural voice) for slides without stored audio
      if (synth && slide && !slide.narration.audioAssetId) {
        if (!enabled || !playing) {
          if (lastPlaying || !enabled) stopSpeech();
        } else {
          const index = slide.narration.captions.findIndex((c) => elapsedMs >= c.startMs && elapsedMs < c.endMs + 250);
          const already = spoken.current && spoken.current.slide === slideIndex && spoken.current.caption === index;
          if (index >= 0 && (!already || jumped || !lastPlaying)) {
            if (jumped || !lastPlaying || !already) synth.cancel();
            const utterance = new SpeechSynthesisUtterance(slide.narration.captions[index].text);
            const voice = pickVoice(opts.current.voices, manifest.language, opts.current.voiceName);
            if (voice) {
              utterance.voice = voice;
              utterance.lang = voice.lang;
            }
            utterance.rate = speed;
            utterance.volume = opts.current.volume;
            // Word-by-word captions: the engine reports each word as it is spoken.
            utterance.onboundary = (e) => {
              if (e.name && e.name !== 'word') return;
              const text = slide.narration.captions[index].text;
              // Some engines omit charLength; then the word runs to the next whitespace.
              const end = e.charIndex + (e.charLength || (text.slice(e.charIndex).match(/^\S+/)?.[0].length ?? 0));
              handle.current.word = { slide: slideIndex, caption: index, charStart: e.charIndex, charEnd: end, at: performance.now() };
            };
            utterance.onend = () => {
              if (handle.current.word?.caption === index) handle.current.word = null;
            };
            synth.speak(utterance);
            spoken.current = { slide: slideIndex, caption: index };
          }
        }
      }
      lastSlide = slideIndex;
      lastPlaying = playing;
      lastElapsed = elapsedMs;
    };

    const unsubscribe = clock.subscribe(sync);
    return () => {
      unsubscribe();
      clock.holdAt = null;
      audio.pause();
      audio.src = '';
      stopSpeech();
      handle.current.levels = () => null;
    };
  }, [clock, manifest]);

  // Muting or volume changes apply immediately.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = options.volume;
    if (!options.enabled) {
      audioRef.current?.pause();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      handle.current.word = null;
    }
  }, [options.enabled, options.volume]);

  return handle.current;
}
