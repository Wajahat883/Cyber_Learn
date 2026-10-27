import { useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, FileText, Sparkles, Trash2, UploadCloud, ShieldAlert, Save } from 'lucide-react';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  GenerationPreferencesSchema,
  MAX_PASTED_TEXT_CHARS,
  MAX_UPLOAD_BYTES,
  type GenerationPreferences,
} from '@cyberlearn/shared';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../auth/AuthContext';
import { useSubjects, useWorkspace } from '../subjects/useSubjects';
import { Card, CardTitle, PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Segmented, Select, Textarea, Toggle } from '../../components/ui/Field';
import { Alert, Badge } from '../../components/ui/Feedback';
import { formatBytes } from '../../utils/format';
import type { Project, Source, Generation } from '../../types/models';

interface PendingFile {
  file: File;
  status: 'waiting' | 'uploading' | 'done' | 'error';
  error?: string;
}

export function PreferencesForm({ value, onChange }: { value: GenerationPreferences; onChange: (v: GenerationPreferences) => void }) {
  const set = <K extends keyof GenerationPreferences>(key: K, v: GenerationPreferences[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="space-y-4">
      <Segmented
        label="Language"
        value={value.language}
        onChange={(v) => set('language', v)}
        options={[
          { value: 'en', label: 'English' },
          { value: 'roman-urdu', label: 'Roman Urdu' },
          { value: 'bilingual', label: 'Bilingual' },
        ]}
      />
      <Segmented
        label="Explanation level"
        value={value.difficulty}
        onChange={(v) => set('difficulty', v)}
        options={[
          { value: 'beginner', label: 'Beginner' },
          { value: 'intermediate', label: 'Intermediate' },
          { value: 'advanced', label: 'Advanced' },
        ]}
      />
      <Segmented
        label="Presentation density"
        value={value.density}
        onChange={(v) => set('density', v)}
        options={[
          { value: 'concise', label: 'Concise' },
          { value: 'detailed', label: 'Detailed' },
        ]}
      />
      <Segmented
        label="Visual mode"
        value={value.visualMode}
        onChange={(v) => set('visualMode', v)}
        options={[
          { value: 'diagrams', label: 'Diagrams' },
          { value: 'illustrations', label: 'Illustrations' },
          { value: 'both', label: 'Both' },
        ]}
      />
      <div className="divide-y divide-border">
        <Toggle label="Narration" description="Spoken explanation synced with slide animations" checked={value.narration} onChange={(v) => set('narration', v)} />
        <Toggle label="Quiz generation" checked={value.quizzes} onChange={(v) => set('quizzes', v)} />
        <Toggle label="Flashcard generation" checked={value.flashcards} onChange={(v) => set('flashcards', v)} />
      </div>
    </div>
  );
}

export function useDefaultPreferences(): GenerationPreferences {
  const { user } = useAuth();
  return GenerationPreferencesSchema.parse({
    language: user?.preferences?.language,
    difficulty: user?.preferences?.difficulty,
    density: user?.preferences?.presentationDensity,
    visualMode: user?.preferences?.visualMode,
    narration: user?.preferences?.narrationEnabled,
  });
}

export function uploadFile(projectId: string, file: File, title?: string) {
  const form = new FormData();
  form.append('file', file);
  if (title) form.append('title', title);
  return api.post<{ source: Source; duplicate: boolean }>(`/projects/${projectId}/sources/upload`, form);
}

export function validateFile(file: File): string | null {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!(ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) return `Unsupported type (${ext || 'no extension'})`;
  if (file.size > MAX_UPLOAD_BYTES) return `Larger than ${formatBytes(MAX_UPLOAD_BYTES)}`;
  return null;
}

export function CreateLessonPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: subjects } = useSubjects();
  const { workspaceId } = useWorkspace();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [tags, setTags] = useState('');
  const [subjectId, setSubjectId] = useState(workspaceId);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [preferences, setPreferences] = useState<GenerationPreferences>(useDefaultPreferences());
  const [reviewPlan, setReviewPlan] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'generate'>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...list].map<PendingFile>((file) => {
      const problem = validateFile(file);
      return problem ? { file, status: 'error', error: problem } : { file, status: 'waiting' };
    });
    setFiles((f) => [...f, ...next].slice(0, 10));
    if (!title && list[0]) setTitle(list[0].name.replace(/\.[^.]+$/, ''));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const hasText = text.trim().length >= 20;
  const validFiles = files.filter((f) => f.status !== 'error');
  const canSubmit = title.trim() && (hasText || validFiles.length > 0) && text.length <= MAX_PASTED_TEXT_CHARS;

  const submit = async (mode: 'save' | 'generate') => {
    setBusy(mode);
    setError(null);
    try {
      const { project } = await api.post<{ project: Project }>('/projects', {
        title: title.trim(),
        subjectId: subjectId || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        preferences,
      });
      const sourceIds: string[] = [];
      if (hasText) {
        const res = await api.post<{ source: Source }>(`/projects/${project._id}/sources/text`, { title: title.trim(), text });
        sourceIds.push(res.source._id);
      }
      for (let i = 0; i < files.length; i++) {
        if (files[i].status === 'error') continue;
        setFiles((f) => f.map((x, j) => (j === i ? { ...x, status: 'uploading' } : x)));
        try {
          const res = await uploadFile(project._id, files[i].file);
          sourceIds.push(res.source._id);
          setFiles((f) => f.map((x, j) => (j === i ? { ...x, status: 'done' } : x)));
        } catch (err) {
          setFiles((f) => f.map((x, j) => (j === i ? { ...x, status: 'error', error: errorMessage(err) } : x)));
        }
      }
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (mode === 'generate' && sourceIds.length) {
        const { generation } = await api.post<{ generation: Generation }>(`/projects/${project._id}/generations`, {
          sourceIds,
          preferences,
          autoContinue: !reviewPlan,
        });
        navigate(`/generations/${generation._id}`);
      } else {
        navigate(`/projects/${project._id}`);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Create" title="Create New Lesson" description="Paste your material or upload documents. The application analyzes it and builds the complete learning experience." />
      <div className="grid xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <Card>
            <CardTitle icon={<FileText className="h-4 w-4" />}>Source material</CardTitle>
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <Input label="Lesson title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. SIEM Architecture" maxLength={200} />
              <Select label="Subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">Detect automatically / none</option>
                {subjects?.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <Textarea
              label="Paste your notes"
              hint={`${text.length.toLocaleString()} / ${MAX_PASTED_TEXT_CHARS.toLocaleString()} characters`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste lesson notes, a lecture transcript, module summary or documentation…"
              className="[&_textarea]:min-h-[300px] [&_textarea]:font-mono [&_textarea]:text-[13px]"
              error={text.length > MAX_PASTED_TEXT_CHARS ? 'This text is longer than the limit. Split it into several projects or upload it as a file.' : undefined}
            />
            <Input className="mt-4" label="Tags" hint="comma separated, optional" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="soc, siem, htb-cdsa" />
          </Card>

          <Card>
            <CardTitle icon={<UploadCloud className="h-4 w-4" />}>Upload documents</CardTitle>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-border'}`}
            >
              <UploadCloud className="h-10 w-10 mx-auto text-primary/70" />
              <p className="mt-2 font-medium">Drag and drop files here</p>
              <p className="text-sm text-muted">
                PDF, DOCX, TXT or Markdown · up to {formatBytes(MAX_UPLOAD_BYTES)} each · max 10 files
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => inputRef.current?.click()}>
                Browse files
              </Button>
              <input ref={inputRef} type="file" multiple hidden accept={ALLOWED_UPLOAD_EXTENSIONS.join(',')} onChange={(e) => addFiles(e.target.files)} />
            </div>
            {files.length > 0 && (
              <ul className="mt-4 space-y-2">
                {files.map((f, i) => (
                  <li key={`${f.file.name}-${i}`} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="truncate">{f.file.name}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-muted">{formatBytes(f.file.size)}</span>
                      {f.status === 'error' ? <Badge tone="error">{f.error}</Badge> : <Badge tone={f.status === 'done' ? 'success' : 'default'}>{f.status}</Badge>}
                      <button onClick={() => setFiles((all) => all.filter((_, j) => j !== i))} aria-label={`Remove ${f.file.name}`} className="text-muted hover:text-error">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="xl:sticky xl:top-20">
            <CardTitle icon={<Sparkles className="h-4 w-4" />}>Generate</CardTitle>
            <div className="divide-y divide-border mb-4">
              <Toggle
                label="Review the plan first"
                description="Pause after analysis so you can edit the title and remove sections before media is generated"
                checked={reviewPlan}
                onChange={setReviewPlan}
              />
            </div>
            <button type="button" onClick={() => setAdvanced(!advanced)} className="flex items-center gap-2 text-sm text-muted hover:text-text mb-3" aria-expanded={advanced}>
              <ChevronDown className={`h-4 w-4 transition-transform ${advanced ? 'rotate-180' : ''}`} /> Advanced preferences
            </button>
            {advanced && (
              <div className="mb-5">
                <PreferencesForm value={preferences} onChange={setPreferences} />
              </div>
            )}
            {error && (
              <div className="mb-3">
                <Alert tone="error">{error}</Alert>
              </div>
            )}
            <Button size="lg" className="w-full" disabled={!canSubmit} loading={busy === 'generate'} onClick={() => submit('generate')} icon={<Sparkles className="h-4 w-4" />}>
              Generate Learning Experience
            </Button>
            <Button variant="outline" className="w-full mt-2" disabled={!canSubmit} loading={busy === 'save'} onClick={() => submit('save')} icon={<Save className="h-4 w-4" />}>
              Save project without generating
            </Button>
            <div className="mt-4 flex gap-2 text-xs text-muted">
              <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
              <p>Do not upload secrets, credentials or sensitive third-party data unless you are authorized to process it. Logs you paste are sent to the configured AI provider.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
