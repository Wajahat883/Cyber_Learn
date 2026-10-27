import { useEffect, useState } from 'react';

/**
 * Narration voices come from the browser's own speech engine — free, no key,
 * and official. Microsoft Edge exposes natural neural voices (including Urdu and
 * Hindi); Chrome offers Google voices.
 */
export const isNatural = (v: SpeechSynthesisVoice) => /natural|neural|online|google|premium|enhanced/i.test(v.name);

/** Preferred voice languages per lesson language. Roman Urdu is Latin script, so South-Asian English reads it best. */
const LANGS: Record<string, string[]> = {
  en: ['en-US', 'en-GB', 'en-IN', 'en'],
  'roman-urdu': ['en-IN', 'en-PK', 'en-GB', 'en'],
  bilingual: ['en-IN', 'en-PK', 'en-US', 'en'],
};

export function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : []));
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const update = () => setVoices(window.speechSynthesis.getVoices());
    update();
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  return voices;
}

/** The chosen voice if available, otherwise the most natural voice for the lesson language. */
export function pickVoice(voices: SpeechSynthesisVoice[], language: string, preferredName?: string): SpeechSynthesisVoice | undefined {
  if (preferredName) {
    const chosen = voices.find((v) => v.name === preferredName);
    if (chosen) return chosen;
  }
  for (const lang of LANGS[language] ?? LANGS.en) {
    const matching = voices.filter((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
    const best = matching.find(isNatural) ?? matching[0];
    if (best) return best;
  }
  return voices.find(isNatural) ?? voices[0];
}

export function speakSample(voice: SpeechSynthesisVoice | undefined, text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  }
  window.speechSynthesis.speak(u);
}
