import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Mic, Play, Sparkles } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { isNatural, pickVoice, speakSample, useVoices } from '../../lib/voices';
import { Card, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { Alert, Badge } from '../../components/ui/Feedback';
import { useAuth } from '../auth/AuthContext';
import type { User } from '../../types/models';

const SAMPLES: Record<string, string> = {
  en: 'A SIEM collects security events from many log sources and raises alerts for the analyst.',
  ur: 'سیم بہت سے لاگ ذرائع سے سیکیورٹی ایونٹس جمع کرتا ہے۔',
  hi: 'सिएम कई लॉग स्रोतों से सुरक्षा घटनाएँ इकट्ठा करता है।',
  roman: 'SIEM ek aisa system hai jo bohat saare log sources se security events collect karta hai.',
};

/** Free natural narration voice chosen from the browser's speech engine. */
export function VoiceCard() {
  const { user, setUser } = useAuth();
  const voices = useVoices();
  const [voiceName, setVoiceName] = useState(user?.preferences.narrationVoice ?? '');
  const language = user?.preferences.language ?? 'en';
  const relevant = useMemo(
    () =>
      voices
        .filter((v) => /^(en|ur|hi)/i.test(v.lang))
        .sort((a, b) => Number(isNatural(b)) - Number(isNatural(a)) || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name)),
    [voices],
  );
  const effective = pickVoice(voices, language, voiceName);
  const naturalCount = relevant.filter(isNatural).length;
  const save = useMutation({
    mutationFn: () => api.patch<{ user: User }>('/account/profile', { preferences: { narrationVoice: voiceName } }),
    onSuccess: (r) => setUser(r.user),
  });
  const sample = effective?.lang.startsWith('ur') ? SAMPLES.ur : effective?.lang.startsWith('hi') ? SAMPLES.hi : language === 'roman-urdu' ? SAMPLES.roman : SAMPLES.en;

  return (
    <Card>
      <CardTitle icon={<Mic className="h-4 w-4" />} action={<Badge tone="success">free</Badge>}>
        Narration voice
      </CardTitle>
      <p className="text-sm text-muted mb-4">
        The teacher&apos;s voice comes from your browser — no API key, nothing to pay. Microsoft Edge offers the most natural voices (including Urdu and Hindi); words are highlighted in the
        captions as they are spoken.
      </p>
      {!voices.length ? (
        <Alert tone="info">This browser exposes no speech voices. Try Microsoft Edge or Chrome for natural narration.</Alert>
      ) : (
        <div className="space-y-3">
          <Select label="Voice" value={voiceName} onChange={(e) => setVoiceName(e.target.value)}>
            <option value="">Automatic — best voice for the lesson language</option>
            {relevant.map((v) => (
              <option key={v.name} value={v.name}>
                {isNatural(v) ? '★ ' : ''}
                {v.name} ({v.lang})
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {naturalCount ? `${naturalCount} natural voices available (★).` : 'No natural voices found in this browser; open the app in Microsoft Edge for neural voices.'} Now using:{' '}
            <span className="text-text">{effective ? `${effective.name}` : 'default'}</span>
          </p>
          {save.error && <Alert tone="error">{errorMessage(save.error)}</Alert>}
          <div className="flex gap-2">
            <Button variant="outline" icon={<Play className="h-4 w-4" />} onClick={() => speakSample(effective, sample)}>
              Preview
            </Button>
            <Button loading={save.isPending} disabled={voiceName === (user?.preferences.narrationVoice ?? '')} onClick={() => save.mutate()}>
              Save voice
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
