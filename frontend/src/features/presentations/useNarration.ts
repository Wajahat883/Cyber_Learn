import { useEffect, useRef } from 'react';
import type { PresentationManifest } from '@cyberlearn/shared';
import { assetUrl } from '../../lib/api';
import type { PresentationClock } from './clock';

const VOICE_LANG: Record<string, string> = { en: 'en-US', 'roman-urdu': 'en-IN', bilingual: 'en-IN' };

/**
 * Keeps narration and animation on one timeline (spec 4.8):
 * - stored TTS audio follows the clock (seek, pause, speed) and holds it while buffering;
 * - otherwise each caption is spoken by the browser when the clock reaches it, and the
 *   clock waits at the next caption until the voice has finished.
 */
export function useNarration(clock: PresentationClock | null, manifest: PresentationManifest | undefined, options: { enabled: boolean; volume: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spoken = useRef<{ slide: number; caption: number } | null>(null);
  const opts = useRef(options);
  opts.current = options;

  useEffect(() => {
    if (!clock || !manifest) return;
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;
    const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    let lastSlide = -1;
    let lastPlaying = false;
    let lastElapsed = 0;

    const stopSpeech = () => {
      synth?.cancel();
      spoken.current = null;
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

    clock.holdAt = (slideIndex, elapsedMs) => hold(shouldHold(slideIndex, elapsedMs));
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
        if (playing && audio.paused && elapsedMs / 1000 < (audio.duration || Infinity)) void audio.play().catch(() => undefined);
        if (!playing && !audio.paused) audio.pause();
      } else if (!audio.paused) {
        audio.pause();
      }

      // ---- browser speech for slides without stored audio
      if (synth && slide && !slide.narration.audioAssetId) {
        if (!enabled || !playing) {
          if (lastPlaying || !enabled) stopSpeech();
        } else {
          const index = slide.narration.captions.findIndex((c) => elapsedMs >= c.startMs && elapsedMs < c.endMs + 250);
          const already = spoken.current && spoken.current.slide === slideIndex && spoken.current.caption === index;
          if (index >= 0 && (!already || jumped || !lastPlaying)) {
            if (jumped || !lastPlaying || !already) synth.cancel();
            const utterance = new SpeechSynthesisUtterance(slide.narration.captions[index].text);
            utterance.rate = speed;
            utterance.volume = opts.current.volume;
            utterance.lang = VOICE_LANG[manifest.language] ?? 'en-US';
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
    };
  }, [clock, manifest]);

  // Muting or volume changes apply immediately.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = options.volume;
    if (!options.enabled) {
      audioRef.current?.pause();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    }
  }, [options.enabled, options.volume]);
}
