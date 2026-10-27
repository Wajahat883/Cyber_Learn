import { useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Paperclip, Save, ShieldAlert, SlidersHorizontal, Sparkles, UploadCloud, X } from 'lucide-react';
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
import { cn } from '../../lib/cn';
import { Steps } from '../../components/ui/Steps';
import { Button } from '../../components/ui/Button';
import { Segmented, Toggle } from '../../components/ui/Field';
import { Alert } from '../../components/ui/Feedback';
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

const LABELS: Record<string, string> = {
  en: 'English',
  'roman-urdu': 'Roman Urdu',
  bilingual: 'Bilingual',
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  concise: 'Concise',
  detailed: 'Detailed',
  diagrams: 'Diagrams',
  illustrations: 'Illustrations',
  both: 'Diagrams + illustrations',
};

/** Screen 2 — one composer for pasting and uploading, sensible defaults, one primary action. */
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

  // A first Markdown heading in pasted notes becomes the title automatically.
  const onText = (value: string) => {
    setText(value);
    if (!title) {
      const heading = value.match(/^#\s+(.+)$/m)?.[1]?.trim();
      if (heading) setTitle(heading.slice(0, 200));
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const hasText = text.trim().length >= 20;
  const validFiles = files.filter((f) => f.status !== 'error');
  const canSubmit = Boolean(title.trim() && (hasText || validFiles.length > 0) && text.length <= MAX_PASTED_TEXT_CHARS);

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

  const summary = [
    LABELS[preferences.language],
    LABELS[preferences.difficulty],
    LABELS[preferences.density],
    LABELS[preferences.visualMode],
    preferences.narration ? 'Narration' : 'No narration',
    [preferences.quizzes && 'Quizzes', preferences.flashcards && 'Flashcards'].filter(Boolean).join(' + ') || 'No revision',
  ];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight">Create a lesson</h1>
          <p className="text-muted mt-1">Paste your notes or drop a document. Everything else is automatic.</p>
        </div>
        <Steps current={0} />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => e.currentTarget.contains(e.relatedTarget as Node) || setDragging(false)}
        onDrop={onDrop}
        className={cn('rounded-3xl border bg-surface shadow-card transition-colors', dragging ? 'border-primary ring-4 ring-primary/15' : 'border-border')}
      >
        <div className="px-6 pt-6">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. SIEM Architecture"
            aria-label="Lesson title"
            maxLength={200}
            className="w-full bg-transparent font-display text-2xl font-bold tracking-tight outline-none placeholder:text-muted/50"
          />
          <div className="flex flex-wrap gap-2 mt-3">
            <select
              aria-label="Subject"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="h-8 rounded-lg bg-surface-2 px-2.5 text-[13px] text-text border border-transparent focus:border-primary focus:outline-none"
            >
              <option value="">Subject: detect automatically</option>
              {subjects?.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Tags: soc, siem, htb-cdsa"
              aria-label="Tags"
              className="h-8 min-w-0 flex-1 rounded-lg bg-surface-2 px-2.5 text-[13px] border border-transparent focus:border-primary focus:outline-none placeholder:text-muted"
            />
          </div>
        </div>

        <div className="relative mt-4">
          <textarea
            value={text}
            onChange={(e) => onText(e.target.value)}
            aria-label="Paste your notes"
            placeholder="Paste lesson notes, a lecture transcript, a module summary or documentation… or drop PDF, DOCX, TXT and Markdown files here."
            className="block w-full min-h-[320px] resize-y bg-transparent px-6 py-4 font-mono text-[13px] leading-relaxed outline-none border-y border-border placeholder:font-sans placeholder:text-sm placeholder:text-muted"
          />
          {dragging && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-primary-soft/90 text-primary font-medium pointer-events-none">
              <UploadCloud className="h-8 w-8" /> Drop files to attach
            </div>
          )}
        </div>

        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2 px-6 pt-4">
            {files.map((f, i) => (
              <li
                key={`${f.file.name}-${i}`}
                className={cn('inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px]', f.status === 'error' ? 'border-error/40 bg-error/5 text-error' : 'border-border bg-surface-2')}
                title={f.error}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate max-w-48">{f.file.name}</span>
                <span className="text-muted">{f.status === 'error' ? f.error : f.status === 'waiting' ? formatBytes(f.file.size) : f.status}</span>
                <button onClick={() => setFiles((all) => all.filter((_, j) => j !== i))} aria-label={`Remove ${f.file.name}`} className="text-muted hover:text-error">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 text-sm text-muted hover:text-primary">
            <Paperclip className="h-4 w-4" /> Attach files
            <span className="hidden sm:inline text-xs">· PDF, DOCX, TXT, MD · up to {formatBytes(MAX_UPLOAD_BYTES)}</span>
          </button>
          <input ref={inputRef} type="file" multiple hidden accept={ALLOWED_UPLOAD_EXTENSIONS.join(',')} onChange={(e) => addFiles(e.target.files)} />
          <span className={cn('text-xs tabular-nums', text.length > MAX_PASTED_TEXT_CHARS ? 'text-error' : 'text-muted')}>
            {text.length.toLocaleString()} / {MAX_PASTED_TEXT_CHARS.toLocaleString()}
          </span>
        </div>
      </div>
      {text.length > MAX_PASTED_TEXT_CHARS && (
        <p className="text-sm text-error mt-2">This text is longer than the limit. Split it into several projects or upload it as a file.</p>
      )}

      <div className="mt-5 rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <SlidersHorizontal className="h-4 w-4 text-muted" />
          <p className="flex-1 min-w-0 text-sm text-muted truncate">{summary.join(' · ')}</p>
          <button type="button" onClick={() => setAdvanced(!advanced)} className="text-sm font-medium text-primary hover:underline" aria-expanded={advanced}>
            {advanced ? 'Done' : 'Customize'}
          </button>
        </div>
        {advanced && (
          <div className="border-t border-border px-5 py-5">
            <PreferencesForm value={preferences} onChange={setPreferences} />
          </div>
        )}
        <div className="border-t border-border px-5">
          <Toggle label="Review the plan first" description="Pause after analysis so you can rename the lesson and remove sections before media is generated" checked={reviewPlan} onChange={setReviewPlan} />
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center gap-3">
        <p className="flex-1 flex gap-2 text-xs text-muted">
          <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
          Don&apos;t include secrets, credentials or third-party data you aren&apos;t authorized to process. Notes are sent to the configured AI provider.
        </p>
        <Button variant="ghost" disabled={!canSubmit} loading={busy === 'save'} onClick={() => submit('save')} icon={<Save className="h-4 w-4" />}>
          Save as draft
        </Button>
        <Button size="lg" disabled={!canSubmit} loading={busy === 'generate'} onClick={() => submit('generate')} icon={<Sparkles className="h-4 w-4" />}>
          Generate Learning Experience
        </Button>
      </div>
    </div>
  );
}
