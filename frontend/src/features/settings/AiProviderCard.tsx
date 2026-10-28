import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Cpu, ExternalLink, KeyRound, RefreshCw, Server, Sparkles, Zap } from 'lucide-react';
import { isLikelyChatModel, MAX_FALLBACK_MODELS, type AiProviderId, type AiProviderPreset } from '@cyberlearn/shared';
import { api, errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Card, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea, Toggle } from '../../components/ui/Field';
import { Alert, Badge } from '../../components/ui/Feedback';

interface AiSettingsResponse {
  settings: { provider: AiProviderId; model: string; fallbackModels?: string[]; baseUrl: string; hasKey: boolean; keyHint: string; updatedAt: string } | null;
  serverDefault: { provider: string; model: string };
  presets: AiProviderPreset[];
  usage: {
    calls: number;
    chars: number;
    /** Real provider token counts (older servers omit them). */
    tokens?: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
    limits: { calls: number; chars: number };
  };
}

/** Today's AI usage against the daily ceiling (the tighter of the two limits). */
function UsageLine({ usage }: { usage: AiSettingsResponse['usage'] }) {
  const parts = [usage.limits.calls ? usage.calls / usage.limits.calls : 0, usage.limits.chars ? usage.chars / usage.limits.chars : 0];
  const used = Math.min(1, Math.max(...parts));
  // Prefer measured tokens; fall back to the ~4 characters per token estimate.
  const tokenCount = usage.tokens ? usage.tokens.input + usage.tokens.output : usage.chars / 4;
  const tokensLabel = `${usage.tokens ? '' : '~'}${(tokenCount / 1000).toFixed(1)}k tokens`;
  if (!usage.limits.calls && !usage.limits.chars) return <p className="text-xs text-muted mb-4">Today: {usage.calls} AI calls · {tokensLabel} (no daily limit).</p>;
  return (
    <div className="mb-4">
      <div className="flex justify-between text-xs text-muted mb-1">
        <span>
          Today: {usage.calls} AI calls · {tokensLabel}
        </span>
        <span>{Math.round(used * 100)}% of daily limit</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden" role="progressbar" aria-valuenow={Math.round(used * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Daily AI usage">
        <div className={cn('h-full rounded-full', used >= 0.9 ? 'bg-error' : used >= 0.7 ? 'bg-warning' : 'bg-primary')} style={{ width: `${used * 100}%` }} />
      </div>
    </div>
  );
}

/** One model id per line; blanks, duplicates and the main model are dropped. */
export function parseFallbackModels(text: string, mainModel: string): string[] {
  const ids = text
    .split(/[\n,]/)
    .map((m) => m.trim())
    .filter((m) => m && m !== mainModel);
  return [...new Set(ids)].slice(0, MAX_FALLBACK_MODELS);
}

/** Free OpenRouter-style models (":free" suffix) to fall back on, excluding ones already chosen. */
export function pickFreeModels(available: string[], chosen: string[], mainModel: string, count = 3): string[] {
  return available.filter((m) => m.endsWith(':free') && isLikelyChatModel(m) && m !== mainModel && !chosen.includes(m)).slice(0, count);
}

/** Model ids to show in the picker: free ones only when asked, free ones first otherwise; non-chat models (safety, embeddings…) last. */
export function visibleModels(models: string[], freeOnly: boolean): string[] {
  const free = models.filter((m) => m.endsWith(':free'));
  const list = freeOnly ? free : [...free, ...models.filter((m) => !m.endsWith(':free'))];
  return [...list.filter(isLikelyChatModel), ...list.filter((m) => !isLikelyChatModel(m))];
}

/**
 * Connect your own AI provider. The key is sent once, encrypted on the server
 * and never shown again — only a hint like ••••1234.
 */
export function AiProviderCard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['ai-settings'], queryFn: () => api.get<AiSettingsResponse>('/account/ai') });
  const [provider, setProvider] = useState<AiProviderId | null>(null);
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [fallbackText, setFallbackText] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [freeOnly, setFreeOnly] = useState(true);
  const [tested, setTested] = useState<{ latencyMs: number; model: string } | null>(null);

  useEffect(() => {
    if (data?.settings && provider === null) {
      setProvider(data.settings.provider);
      setModel(data.settings.model);
      setBaseUrl(data.settings.baseUrl);
      setFallbackText((data.settings.fallbackModels ?? []).join('\n'));
    }
  }, [data, provider]);

  const preset = data?.presets.find((p) => p.id === provider);
  const saved = data?.settings;
  const usingSavedKey = Boolean(saved?.hasKey && saved.provider === provider && !apiKey);
  const supportsFallback = preset?.protocol === 'openai-compatible';
  const fallbackModels = supportsFallback ? parseFallbackModels(fallbackText, model) : [];
  const freeSuggestions = pickFreeModels(models, fallbackModels, model);
  const freeCount = models.filter((m) => m.endsWith(':free')).length;
  const shownModels = visibleModels(models, freeOnly && freeCount > 0);
  const body = () => ({ provider, model, baseUrl, fallbackModels, ...(apiKey ? { apiKey } : {}) });
  const reset = () => {
    setModels([]);
    setTested(null);
  };

  const loadModels = useMutation({
    mutationFn: () => api.post<{ models: string[] }>('/account/ai/models', body()),
    onSuccess: (r) => {
      setModels(r.models);
      const hasFree = r.models.some((m) => m.endsWith(':free'));
      setFreeOnly(hasFree);
      // Only fill an empty model box; prefer a suggested model, then a free one.
      if (!model && r.models[0]) setModel(preset?.suggestedModels.find((m) => r.models.includes(m)) ?? visibleModels(r.models, hasFree)[0] ?? r.models[0]);
    },
  });
  const test = useMutation({ mutationFn: () => api.post<{ ok: boolean; latencyMs: number; model: string }>('/account/ai/test', body()), onSuccess: (r) => setTested(r) });
  const save = useMutation({
    mutationFn: () => api.put<{ fallbackModels?: string[] }>('/account/ai', body()),
    onSuccess: (r) => {
      setApiKey('');
      // The server fills in free fallback models when the list was left empty.
      if (r.fallbackModels?.length) setFallbackText(r.fallbackModels.join('\n'));
      qc.invalidateQueries({ queryKey: ['ai-settings'] });
      qc.invalidateQueries({ queryKey: ['account-overview'] });
    },
  });
  const clear = useMutation({
    mutationFn: () => api.delete('/account/ai'),
    onSuccess: () => {
      setProvider(null);
      setModel('');
      setApiKey('');
      reset();
      qc.invalidateQueries({ queryKey: ['ai-settings'] });
      qc.invalidateQueries({ queryKey: ['account-overview'] });
    },
  });
  const error = loadModels.error ?? test.error ?? save.error ?? clear.error;
  const needsKey = Boolean(preset?.needsKey) && !apiKey && !usingSavedKey;

  return (
    <Card>
      <CardTitle icon={<Cpu className="h-4 w-4" />} action={saved ? <Badge tone="success">Your provider</Badge> : <Badge>Server default</Badge>}>
        AI provider
      </CardTitle>
      <p className="text-sm text-muted mb-4">
        {saved ? (
          <>
            Lessons are generated with <strong className="text-text">{data?.presets.find((p) => p.id === saved.provider)?.label}</strong>
            {saved.model && <> · {saved.model}</>}
            {(saved.fallbackModels?.length ?? 0) > 0 && <> · {saved.fallbackModels!.length} fallback{saved.fallbackModels!.length > 1 ? 's' : ''}</>}
            {saved.keyHint && <> · key {saved.keyHint}</>}.
          </>
        ) : (
          <>
            Using the server setting: <strong className="text-text">{data?.serverDefault.provider === 'mock' ? 'offline mode (no AI)' : `${data?.serverDefault.provider} ${data?.serverDefault.model}`}</strong>. Connect a provider for real AI
            explanations.
          </>
        )}
      </p>
      {data?.usage && <UsageLine usage={data.usage} />}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="AI provider">
        {data?.presets.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={provider === p.id}
            onClick={() => {
              setProvider(p.id);
              setModel(saved?.provider === p.id ? saved.model : (p.suggestedModels[0] ?? ''));
              setFallbackText(saved?.provider === p.id ? (saved.fallbackModels ?? []).join('\n') : '');
              setApiKey('');
              reset();
            }}
            className={cn(
              'rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
              provider === p.id ? 'border-primary bg-primary-soft text-text' : 'border-border hover:border-primary/40 bg-surface',
            )}
          >
            <span className="font-medium block truncate">{p.label}</span>
            <span className="text-[11px] text-muted">{p.id === 'ollama' ? 'free · local' : p.needsKey ? 'API key' : 'endpoint'}</span>
          </button>
        ))}
      </div>

      {preset && (
        <div className="mt-5 space-y-4">
          <p className="text-xs text-muted flex gap-2">
            <Server className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {preset.note}
            {preset.keyUrl && (
              <a href={preset.keyUrl} target="_blank" rel="noreferrer noopener" className="text-primary inline-flex items-center gap-1 shrink-0">
                {preset.needsKey ? 'Get a key' : 'Download'} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </p>
          {preset.id === 'custom' && (
            <Input label="Endpoint URL" placeholder="https://api.example.com/v1" value={baseUrl} onChange={(e) => (setBaseUrl(e.target.value), reset())} />
          )}
          {(preset.needsKey || preset.id === 'custom') && (
            <Input
              label="API key"
              type="password"
              autoComplete="off"
              hint={usingSavedKey ? `saved ${saved?.keyHint} — leave empty to keep it` : 'stored encrypted on the server, never shown again'}
              placeholder={usingSavedKey ? '••••••••••••' : 'Paste your key'}
              value={apiKey}
              onChange={(e) => (setApiKey(e.target.value.trim()), reset())}
            />
          )}
          <div>
            <div className="flex items-end gap-2">
              <Input className="flex-1" label="Model" hint={preset.id === 'anthropic' ? 'empty = claude-opus-5-5' : undefined} list="ai-models" placeholder="Model name" value={model} onChange={(e) => (setModel(e.target.value), setTested(null))} />
              <Button variant="outline" icon={<RefreshCw className="h-4 w-4" />} loading={loadModels.isPending} disabled={needsKey} onClick={() => loadModels.mutate()}>
                Load models
              </Button>
            </div>
            <datalist id="ai-models">
              {[...new Set([...models, ...preset.suggestedModels])].map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            {models.length > 0 && (
              <div className="mt-3 rounded-xl border border-border bg-surface-2/40 px-3 pb-3">
                {freeCount > 0 && <Toggle checked={freeOnly} onChange={setFreeOnly} label={`Free models only (${freeCount} free)`} description={`${models.length} models available in total`} />}
                <Select
                  label={freeCount > 0 ? undefined : `${models.length} models available`}
                  aria-label="Choose a model"
                  value={shownModels.includes(model) ? model : ''}
                  onChange={(e) => (setModel(e.target.value), setTested(null))}
                >
                  <option value="" disabled>
                    Choose from {shownModels.length} model{shownModels.length === 1 ? '' : 's'}…
                  </option>
                  {shownModels.map((m) => (
                    <option key={m} value={m}>
                      {isLikelyChatModel(m) ? m : `${m} — not a chat model, can't write lessons`}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
          {supportsFallback && (
            <div>
              <Textarea
                label="Fallback models"
                hint={`optional · up to ${MAX_FALLBACK_MODELS}, one per line`}
                rows={3}
                placeholder={'e.g. a model ending in :free'}
                value={fallbackText}
                onChange={(e) => (setFallbackText(e.target.value), setTested(null))}
              />
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <p className="text-xs text-muted flex-1 min-w-48">
                  When the main model runs out of credits, hits a rate limit or is unavailable, the next model is used automatically. The main model is tried again after an hour.
                </p>
                {freeSuggestions.length > 0 && fallbackModels.length < MAX_FALLBACK_MODELS && (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Sparkles className="h-4 w-4" />}
                    onClick={() => setFallbackText([...fallbackModels, ...freeSuggestions].slice(0, MAX_FALLBACK_MODELS).join('\n'))}
                  >
                    Add free models
                  </Button>
                )}
              </div>
            </div>
          )}
          {error && <Alert tone="error">{errorMessage(error)}</Alert>}
          {tested && (
            <Alert tone="success">
              Connected to {tested.model} in {(tested.latencyMs / 1000).toFixed(1)} s. Save to use it for new lessons.
            </Alert>
          )}
          {save.isSuccess && !save.isPending && (
            <Alert tone="success">
              Saved. New lessons, “Ask AI” and section tools now use this provider.
              {fallbackModels.length > 0 && <> If {model} hits a limit, the app switches automatically to: {fallbackModels.join(', ')}.</>}
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" icon={<Zap className="h-4 w-4" />} loading={test.isPending} disabled={needsKey || (!model && preset.id !== 'anthropic')} onClick={() => test.mutate()}>
              Test connection
            </Button>
            <Button icon={tested ? <CheckCircle2 className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />} loading={save.isPending} disabled={needsKey || (!model && preset.id !== 'anthropic')} onClick={() => save.mutate()}>
              Save provider
            </Button>
            {saved && (
              <Button variant="ghost" loading={clear.isPending} onClick={() => clear.mutate()}>
                Use server default
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
