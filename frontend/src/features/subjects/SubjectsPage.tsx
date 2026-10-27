import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderKanban, Pencil, Plus, Route, Trash2, X } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { Card, PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Select, Textarea } from '../../components/ui/Field';
import { Alert, EmptyState, PageLoader } from '../../components/ui/Feedback';
import { ConfirmModal, Modal } from '../../components/ui/Modal';
import type { LearningPath, Project, Subject } from '../../types/models';
import { useSubjects } from './useSubjects';
import { LibraryTabs } from '../../components/layout/hubs';

const COLORS = ['#38BDF8', '#8B5CF6', '#34D399', '#FBBF24', '#F87171', '#F472B6', '#22D3EE', '#A3E635'];

function SubjectForm({ initial, onDone }: { initial?: Subject; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const save = useMutation({
    mutationFn: () => (initial ? api.patch(`/subjects/${initial._id}`, { name, description, color }) : api.post('/subjects', { name, description, color })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subjects'] });
      onDone();
    },
  });
  return (
    <div className="space-y-4">
      {save.error && <Alert tone="error">{errorMessage(save.error)}</Alert>}
      <Input label="Subject name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Digital Forensics" maxLength={100} autoFocus />
      <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
      <div>
        <p className="text-sm font-medium mb-1.5">Color</p>
        <div className="flex gap-2" role="radiogroup" aria-label="Subject color">
          {COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-full border-2 ${color === c ? 'border-text' : 'border-transparent'}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim()}>
          {initial ? 'Save subject' : 'Create subject'}
        </Button>
      </div>
    </div>
  );
}

function PathEditor({ subject, path, projects, onDone }: { subject: Subject; path?: LearningPath; projects: Project[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(path?.title ?? '');
  const [description, setDescription] = useState(path?.description ?? '');
  const [modules, setModules] = useState(path?.modules.map((m) => ({ title: m.title, description: m.description, projectIds: m.projectIds })) ?? [{ title: 'Module 1', description: '', projectIds: [] as string[] }]);
  const save = useMutation({
    mutationFn: () => {
      const body = { subjectId: subject._id, title, description, modules };
      return path ? api.patch(`/learning-paths/${path._id}`, body) : api.post('/learning-paths', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['learning-paths'] });
      onDone();
    },
  });
  return (
    <div className="space-y-4">
      {save.error && <Alert tone="error">{errorMessage(save.error)}</Alert>}
      <Input label="Path title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. HTB CDSA preparation" />
      <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="[&_textarea]:min-h-[70px]" />
      <div className="space-y-3">
        {modules.map((m, i) => (
          <div key={i} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex gap-2">
              <Input className="flex-1" aria-label={`Module ${i + 1} title`} value={m.title} onChange={(e) => setModules(modules.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <Button variant="ghost" size="icon" aria-label="Remove module" onClick={() => setModules(modules.filter((_, j) => j !== i))}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Select
              aria-label="Add a project to this module"
              value=""
              onChange={(e) => e.target.value && setModules(modules.map((x, j) => (j === i ? { ...x, projectIds: [...new Set([...x.projectIds, e.target.value])] } : x)))}
            >
              <option value="">Add a project…</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.title}
                </option>
              ))}
            </Select>
            <ul className="text-sm space-y-1">
              {m.projectIds.map((pid) => (
                <li key={pid} className="flex justify-between">
                  {projects.find((p) => p._id === pid)?.title ?? 'Project'}
                  <button className="text-muted hover:text-error" onClick={() => setModules(modules.map((x, j) => (j === i ? { ...x, projectIds: x.projectIds.filter((y) => y !== pid) } : x)))} aria-label="Remove project">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setModules([...modules, { title: `Module ${modules.length + 1}`, description: '', projectIds: [] }])}>
          Add module
        </Button>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!title.trim() || modules.some((m) => !m.title.trim())}>
          Save learning path
        </Button>
      </div>
    </div>
  );
}

export function SubjectsPage() {
  const qc = useQueryClient();
  const { data: subjects, isLoading } = useSubjects();
  const { data: paths } = useQuery({ queryKey: ['learning-paths'], queryFn: async () => (await api.get<{ learningPaths: LearningPath[] }>('/learning-paths')).learningPaths });
  const { data: projects } = useQuery({ queryKey: ['projects', 'all-min'], queryFn: async () => (await api.get<{ projects: Project[] }>('/projects?limit=100&sort=title')).projects });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState<Subject | null>(null);
  const [pathFor, setPathFor] = useState<{ subject: Subject; path?: LearningPath } | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/subjects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subjects'] });
      qc.invalidateQueries({ queryKey: ['learning-paths'] });
    },
  });
  const removePath = useMutation({ mutationFn: (id: string) => api.delete(`/learning-paths/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['learning-paths'] }) });

  if (isLoading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Library"
        description="Subjects organise your projects. Add one and the importer, AI teacher, quizzes and revision work for it immediately."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            Add new subject
          </Button>
        }
      />
      <LibraryTabs active="subjects" />
      {!subjects?.length ? (
        <EmptyState icon={<FolderKanban className="h-10 w-10" />} title="No subjects yet" action={<Button onClick={() => setCreating(true)}>Add a subject</Button>} />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {subjects.map((s) => {
            const subjectPaths = paths?.filter((p) => p.subjectId === s._id) ?? [];
            return (
              <Card key={s._id} className="border-l-4" style={{ borderLeftColor: s.color }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link to={`/library?subjectId=${s._id}`} className="font-semibold text-lg hover:text-primary">
                      {s.name}
                    </Link>
                    <p className="text-sm text-muted">{s.description || 'No description'}</p>
                    <p className="text-xs text-muted mt-1">
                      {s.projectCount ?? 0} project{s.projectCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex">
                    <Button variant="ghost" size="icon" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`} onClick={() => setDeleting(s)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-4 border-t border-border pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <Route className="h-4 w-4 text-secondary" /> Learning paths
                    </p>
                    <Button size="sm" variant="ghost" onClick={() => setPathFor({ subject: s })}>
                      <Plus className="h-4 w-4" /> Path
                    </Button>
                  </div>
                  {subjectPaths.length === 0 && <p className="text-xs text-muted">No learning paths yet.</p>}
                  {subjectPaths.map((p) => (
                    <div key={p._id} className="rounded-lg bg-surface-2 p-3 mb-2">
                      <div className="flex justify-between gap-2">
                        <p className="font-medium text-sm">{p.title}</p>
                        <div className="flex gap-2 text-xs">
                          <button className="text-primary" onClick={() => setPathFor({ subject: s, path: p })}>
                            Edit
                          </button>
                          <button className="text-error" onClick={() => removePath.mutate(p._id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                      <ol className="mt-2 space-y-1 text-sm list-decimal pl-5">
                        {p.modules.map((m) => (
                          <li key={m._id}>
                            {m.title}
                            {m.projectIds.length > 0 && (
                              <span className="text-muted">
                                {' '}
                                —{' '}
                                {m.projectIds
                                  .map((pid) => projects?.find((x) => x._id === pid)?.title)
                                  .filter(Boolean)
                                  .join(', ')}
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Add new subject">
        <SubjectForm onDone={() => setCreating(false)} />
      </Modal>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit subject">
        {editing && <SubjectForm initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={Boolean(pathFor)} onClose={() => setPathFor(null)} title={pathFor?.path ? 'Edit learning path' : `New learning path — ${pathFor?.subject.name ?? ''}`} wide>
        {pathFor && <PathEditor subject={pathFor.subject} path={pathFor.path} projects={projects ?? []} onDone={() => setPathFor(null)} />}
      </Modal>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete subject?"
        danger
        confirmLabel="Delete subject"
        loading={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting._id);
          setDeleting(null);
        }}
      >
        Projects in <strong className="text-text">{deleting?.name}</strong> are kept and become unassigned. Its learning paths are deleted.
      </ConfirmModal>
    </div>
  );
}
