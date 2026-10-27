import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Cpu, ExternalLink, KeyRound, RefreshCw, Server, Zap } from 'lucide-react';
import type { AiProviderId, AiProviderPreset } from '@cyberlearn/shared';
import { api, errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Card, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { Alert, Badge } from '../../components/ui/Feedback';

interface AiSettingsResponse {
  settings: { provider: AiProviderId; model: string; baseUrl: string; hasKey: boolean; keyHint: string; updatedAt: string } | null;
  serverDefault: { provider: string; model: string };
  presets: AiProviderPreset[];
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
  const [models, setModels] = useState<string[]>([]);
  const [tested, setTested] = useState<{ latencyMs: number; model: string } | null>(null);

  useEffect(() => {
    if (data?.settings && provider === null) {
      setProvider(data.settings.provider);
      setModel(data.settings.model);
      setBaseUrl(data.settings.baseUrl);
    }
  }, [data, provider]);

  const preset = data?.presets.find((p) => p.id === provider);
  const saved = data?.settings;
  const usingSavedKey = Boolean(saved?.hasKey && saved.provider === provider && !apiKey);
  const body = () => ({ provider, model, baseUrl, ...(apiKey ? { apiKey } : {}) });
  const reset = () => {
    setModels([]);
    setTested(null);
  };

  const loadModels = useMutation({
    mutationFn: () => api.post<{ models: string[] }>('/account/ai/models', body()),
    onSuccess: (r) => {
      setModels(r.models);
      if (!model && r.models[0]) setModel(preset?.suggestedModels.find((m) => r.models.includes(m)) ?? r.models[0]);
    },
  });
  const test = useMutation({ mutationFn: () => api.post<{ ok: boolean; latencyMs: number; model: string }>('/account/ai/test', body()), onSuccess: (r) => setTested(r) });
  const save = useMutation({
    mutationFn: () => api.put('/account/ai', body()),
    onSuccess: () => {
      setApiKey('');
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
            {saved.keyHint && <> · key {saved.keyHint}</>}.
          </>
        ) : (
          <>
            Using the server setting: <strong className="text-text">{data?.serverDefault.provider === 'mock' ? 'offline mode (no AI)' : `${data?.serverDefault.provider} ${data?.serverDefault.model}`}</strong>. Connect a provider for real AI
            explanations.
          </>
        )}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="AI provider">
        {data?.presets.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={provider === p.id}
            onClick={() => {
              setProvider(p.id);
              setModel(saved?.provider === p.id ? saved.model : (p.suggestedModels[0] ?? ''));
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
            {models.length > 0 && <p className="text-xs text-muted mt-1.5">{models.length} models available — start typing to filter.</p>}
          </div>
          {error && <Alert tone="error">{errorMessage(error)}</Alert>}
          {tested && (
            <Alert tone="success">
              Connected to {tested.model} in {(tested.latencyMs / 1000).toFixed(1)} s. Save to use it for new lessons.
            </Alert>
          )}
          {save.isSuccess && !save.isPending && <Alert tone="success">Saved. New lessons, “Ask AI” and section tools now use this provider.</Alert>}
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
