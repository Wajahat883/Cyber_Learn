import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cpu, Database, Download, History, KeyRound, LogOut, ShieldAlert, SlidersHorizontal, Trash2, User as UserIcon } from 'lucide-react';
import type { UserPreferences } from '@cyberlearn/shared';
import { API_BASE, api, errorMessage } from '../../lib/api';
import { Card, CardTitle, PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Segmented, Select, Toggle } from '../../components/ui/Field';
import { Alert, Badge, PageLoader, StatusBadge } from '../../components/ui/Feedback';
import { Modal } from '../../components/ui/Modal';
import { formatBytes, timeAgo } from '../../utils/format';
import { useAuth } from '../auth/AuthContext';
import type { User } from '../../types/models';
import { AiProviderCard } from './AiProviderCard';
import { VoiceCard } from './VoiceCard';

interface Overview {
  usage: { generations: number; aiCalls: number; inputChars: number; outputChars: number };
  generations: { _id: string; projectId: { _id: string; title: string } | null; status: string; createdAt: string; usage?: { aiCalls: number } }[];
  storage: { sources: { bytes: number; count: number }; assets: { type: string; bytes: number; count: number }[]; totalBytes: number };
  counts: { projects: number; lessons: number; presentations: number };
  providers: { text: { provider: string; model: string; configured: boolean }; image: { provider: string; model: string }; speech: { provider: string; model: string }; storage: string };
}

function ProfileCard() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.displayName ?? '');
  const save = useMutation({ mutationFn: () => api.patch<{ user: User }>('/account/profile', { displayName: name }), onSuccess: (r) => setUser(r.user) });
  return (
    <Card>
      <CardTitle icon={<UserIcon className="h-4 w-4" />}>Profile and account</CardTitle>
      <div className="space-y-3">
        <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <Input label="Email" value={user?.email ?? ''} disabled />
        {save.error && <Alert tone="error">{errorMessage(save.error)}</Alert>}
        <Button loading={save.isPending} disabled={!name.trim() || name === user?.displayName} onClick={() => save.mutate()}>
          Save profile
        </Button>
      </div>
    </Card>
  );
}

function PreferencesCard() {
  const { user, setUser } = useAuth();
  const [prefs, setPrefs] = useState<UserPreferences>(user!.preferences);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => api.patch<{ user: User }>('/account/profile', { preferences: prefs }),
    onSuccess: (r) => {
      setUser(r.user);
      setSaved(true);
    },
  });
  const set = <K extends keyof UserPreferences>(k: K, v: UserPreferences[K]) => {
    setPrefs({ ...prefs, [k]: v });
    setSaved(false);
  };
  return (
    <Card>
      <CardTitle icon={<SlidersHorizontal className="h-4 w-4" />}>Learning preferences</CardTitle>
      <p className="text-sm text-muted mb-4">Defaults for new lessons; each lesson can override them.</p>
      <div className="space-y-4">
        <Segmented label="Preferred language" value={prefs.language} onChange={(v) => set('language', v)} options={[{ value: 'en', label: 'English' }, { value: 'roman-urdu', label: 'Roman Urdu' }, { value: 'bilingual', label: 'Bilingual' }]} />
        <Segmented label="Explanation depth" value={prefs.difficulty} onChange={(v) => set('difficulty', v)} options={[{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]} />
        <Segmented label="Default presentation style" value={prefs.presentationDensity} onChange={(v) => set('presentationDensity', v)} options={[{ value: 'concise', label: 'Concise' }, { value: 'detailed', label: 'Detailed' }]} />
        <Segmented label="Visual mode" value={prefs.visualMode} onChange={(v) => set('visualMode', v)} options={[{ value: 'diagrams', label: 'Diagrams' }, { value: 'illustrations', label: 'Illustrations' }, { value: 'both', label: 'Both' }]} />
        <Select label="Default playback speed" value={prefs.playbackSpeed} onChange={(e) => set('playbackSpeed', Number(e.target.value))}>
          {[0.75, 1, 1.25, 1.5].map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </Select>
        <div className="divide-y divide-border">
          <Toggle label="Narration" description="Generate and play spoken narration" checked={prefs.narrationEnabled} onChange={(v) => set('narrationEnabled', v)} />
          <Toggle label="Captions" description="Show captions in the presentation player" checked={prefs.captions} onChange={(v) => set('captions', v)} />
        </div>
        {save.error && <Alert tone="error">{errorMessage(save.error)}</Alert>}
        <div className="flex items-center gap-3">
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save preferences
          </Button>
          {saved && <span className="text-sm text-success">Saved</span>}
        </div>
      </div>
    </Card>
  );
}

function SecurityCard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setDone('Password changed. Other sessions were signed out.');
    },
  });
  const logoutAll = useMutation({ mutationFn: () => api.post('/account/logout-all'), onSuccess: () => setDone('All other sessions were signed out.') });
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const removeAccount = useMutation({
    mutationFn: () => api.delete('/account', { password, confirm }),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(['me'], null);
      navigate('/register');
    },
  });
  return (
    <Card>
      <CardTitle icon={<KeyRound className="h-4 w-4" />}>Privacy and security</CardTitle>
      <div className="space-y-3">
        {done && <Alert tone="success">{done}</Alert>}
        <div className="grid sm:grid-cols-2 gap-3">
          <Input label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          <Input label="New password" hint="10+ characters" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        {change.error && <Alert tone="error">{errorMessage(change.error)}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" loading={change.isPending} disabled={!current || next.length < 10} onClick={() => change.mutate()}>
            Change password
          </Button>
          <Button variant="outline" icon={<LogOut className="h-4 w-4" />} loading={logoutAll.isPending} onClick={() => logoutAll.mutate()}>
            Sign out other sessions
          </Button>
        </div>
        <div className="border-t border-border pt-4 mt-4">
          <p className="text-sm font-semibold text-error flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Delete account
          </p>
          <p className="text-sm text-muted mt-1">Permanently deletes your account, every project, uploaded file, generated asset, quiz and progress record.</p>
          <Button variant="danger" className="mt-3" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(true)}>
            Delete my account
          </Button>
        </div>
      </div>
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete account permanently?"
        footer={
          <Button variant="danger" loading={removeAccount.isPending} disabled={!password || confirm !== 'DELETE'} onClick={() => removeAccount.mutate()}>
            Delete everything
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">Download a data export first if you want to keep your material. This cannot be undone.</p>
          {removeAccount.error && <Alert tone="error">{errorMessage(removeAccount.error)}</Alert>}
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Input label='Type "DELETE" to confirm' value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
      </Modal>
    </Card>
  );
}

/** Screen 12 — Settings. */
export function SettingsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['account-overview'], queryFn: () => api.get<Overview>('/account/overview') });
  return (
    <div>
      <PageHeader eyebrow="Settings" title="Settings" />
      <div className="grid xl:grid-cols-2 gap-5">
        <div className="space-y-5">
          <ProfileCard />
          <PreferencesCard />
          <SecurityCard />
        </div>
        <div className="space-y-5">
          <AiProviderCard />
          <VoiceCard />
          {isLoading || !data ? (
            <PageLoader />
          ) : (
            <>
              <Card>
                <CardTitle icon={<Cpu className="h-4 w-4" />}>Server services</CardTitle>
                <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
                  <dt className="text-muted">Text AI</dt>
                  <dd>
                    {data.providers.text.provider} <span className="text-muted">· {data.providers.text.model}</span> {!data.providers.text.configured && <Badge tone="warning">not configured</Badge>}
                  </dd>
                  <dt className="text-muted">Images</dt>
                  <dd>{data.providers.image.provider}</dd>
                  <dt className="text-muted">Narration</dt>
                  <dd>{data.providers.speech.provider === 'browser' ? 'browser speech (offline)' : data.providers.speech.provider}</dd>
                  <dt className="text-muted">File storage</dt>
                  <dd>{data.providers.storage}</dd>
                </dl>
                <p className="text-xs text-muted mt-3">Images, server narration audio and storage are configured by whoever runs the server, in <code>.env</code>.</p>
              </Card>
              <Card>
                <CardTitle icon={<Database className="h-4 w-4" />}>Usage and storage</CardTitle>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-2xl font-bold">{data.usage.generations}</p>
                    <p className="text-xs text-muted">generations</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{data.usage.aiCalls}</p>
                    <p className="text-xs text-muted">AI requests</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{formatBytes(data.storage.totalBytes)}</p>
                    <p className="text-xs text-muted">stored</p>
                  </div>
                </div>
                <p className="text-xs text-muted mt-3">
                  {(data.usage.inputChars / 1000).toFixed(1)}k characters sent to and {(data.usage.outputChars / 1000).toFixed(1)}k received from the AI provider · {data.storage.sources.count} source files ({formatBytes(data.storage.sources.bytes)}) ·{' '}
                  {data.storage.assets.map((a) => `${a.count} ${a.type}`).join(', ') || 'no generated files'}
                </p>
              </Card>
              <Card>
                <CardTitle icon={<History className="h-4 w-4" />}>Generation history</CardTitle>
                {data.generations.length ? (
                  <ul className="divide-y divide-border text-sm">
                    {data.generations.map((g) => (
                      <li key={g._id} className="flex items-center justify-between gap-2 py-2">
                        <Link to={`/generations/${g._id}`} className="hover:text-primary truncate">
                          {g.projectId?.title ?? 'Deleted project'}
                        </Link>
                        <span className="flex items-center gap-2 shrink-0 text-muted">
                          {timeAgo(g.createdAt)} <StatusBadge status={g.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">No generations yet.</p>
                )}
              </Card>
              <Card>
                <CardTitle icon={<Download className="h-4 w-4" />}>Data export</CardTitle>
                <p className="text-sm text-muted mb-3">Download everything you own — projects, extracted source text, lessons, presentations, quizzes, flashcards and progress — as one JSON backup.</p>
                <a href={`${API_BASE}/account/export`} className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-border bg-surface hover:bg-surface-2 text-sm">
                  <Download className="h-4 w-4" /> Download backup
                </a>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
