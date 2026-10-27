import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Copy, MoreVertical, Pencil, Play, Star, Trash2, Plus } from 'lucide-react';
import { api, qs } from '../../lib/api';
import { useSubjects, useWorkspace } from '../subjects/useSubjects';
import { PageHeader } from '../../components/ui/Card';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { EmptyState, ErrorState, PageLoader, StatusBadge, Badge } from '../../components/ui/Feedback';
import { ConfirmModal, Modal } from '../../components/ui/Modal';
import { cn } from '../../lib/cn';
import { timeAgo } from '../../utils/format';
import type { Project } from '../../types/models';

interface ListResponse {
  projects: Project[];
  total: number;
  page: number;
  pages: number;
}

function ProjectCard({ project, subjectName }: { project: Project; subjectName?: string }) {
  const qc = useQueryClient();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [title, setTitle] = useState(project.title);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const update = useMutation({ mutationFn: (body: Partial<Project>) => api.patch(`/projects/${project._id}`, body), onSuccess: invalidate });
  const duplicate = useMutation({ mutationFn: () => api.post(`/projects/${project._id}/duplicate`), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: () => api.delete(`/projects/${project._id}`), onSuccess: invalidate });

  return (
    <div className="group relative rounded-xl border border-border bg-surface hover:border-primary/40 transition-colors flex flex-col">
      <Link to={`/projects/${project._id}`} className="p-4 flex-1">
        <div className="flex items-start justify-between gap-2 pr-14">
          <h3 className="font-semibold leading-snug line-clamp-2">{project.title}</h3>
        </div>
        <p className="text-xs text-muted mt-1">
          {subjectName ?? (project.subject || 'Unassigned')} · updated {timeAgo(project.updatedAt)}
        </p>
        {project.description && <p className="text-sm text-muted mt-2 line-clamp-2">{project.description}</p>}
        <div className="flex flex-wrap gap-1.5 mt-3">
          <StatusBadge status={project.status.content} />
          {project.status.media !== 'none' && <Badge tone={project.status.media === 'ready' ? 'success' : 'warning'}>media {project.status.media}</Badge>}
          {project.tags.slice(0, 4).map((t) => (
            <Badge key={t}>#{t}</Badge>
          ))}
        </div>
      </Link>
      <div className="absolute top-3 right-3 flex gap-1">
        <button
          onClick={() => update.mutate({ favorite: !project.favorite })}
          aria-label={project.favorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={project.favorite}
          className="p-1.5 rounded-md hover:bg-surface-2"
        >
          <Star className={cn('h-4 w-4', project.favorite ? 'fill-warning text-warning' : 'text-muted')} />
        </button>
        <div className="relative">
          <button onClick={() => setMenu(!menu)} aria-label="Project actions" aria-expanded={menu} className="p-1.5 rounded-md hover:bg-surface-2 text-muted">
            <MoreVertical className="h-4 w-4" />
          </button>
          {menu && (
            <div className="absolute right-0 mt-1 w-44 rounded-lg border border-border bg-surface-2 shadow-xl z-20 p-1 text-sm" onMouseLeave={() => setMenu(false)}>
              <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface" onClick={() => (setMenu(false), setRenaming(true))}>
                <Pencil className="h-4 w-4" /> Rename
              </button>
              <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface" onClick={() => (setMenu(false), duplicate.mutate())}>
                <Copy className="h-4 w-4" /> Duplicate
              </button>
              <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface text-error" onClick={() => (setMenu(false), setDeleting(true))}>
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
      {project.lessonId && (
        <div className="border-t border-border px-4 py-2.5 flex gap-2">
          <ButtonLink to={`/lessons/${project.lessonId}`} size="sm" variant="ghost" icon={<BookOpen className="h-4 w-4" />}>
            Lesson
          </ButtonLink>
          <ButtonLink to={`/lessons/${project.lessonId}/present`} size="sm" variant="ghost" icon={<Play className="h-4 w-4" />}>
            Presentation
          </ButtonLink>
        </div>
      )}

      <Modal
        open={renaming}
        onClose={() => setRenaming(false)}
        title="Rename project"
        footer={
          <Button
            loading={update.isPending}
            onClick={async () => {
              await update.mutateAsync({ title: title.trim() });
              setRenaming(false);
            }}
            disabled={!title.trim()}
          >
            Save
          </Button>
        }
      >
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
      </Modal>
      <ConfirmModal
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await remove.mutateAsync();
          setDeleting(false);
        }}
        loading={remove.isPending}
        title="Delete project?"
        confirmLabel="Delete permanently"
        danger
      >
        This deletes <strong className="text-text">{project.title}</strong>, its sources, lesson, presentation, generated media, quizzes, flashcards and progress. This cannot be undone.
      </ConfirmModal>
    </div>
  );
}

export function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const { workspaceId } = useWorkspace();
  const { data: subjects } = useSubjects();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = params.get('q') ?? '';
  const subjectId = params.get('subjectId') ?? workspaceId;
  const sort = params.get('sort') ?? 'recent';
  const status = params.get('status') ?? '';
  const favorite = params.get('favorite') ?? '';
  const tag = params.get('tag') ?? '';
  const page = Number(params.get('page') ?? 1);

  useEffect(() => {
    setSearch(q);
  }, [q]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['projects', { q, subjectId, sort, status, favorite, tag, page }],
    queryFn: () => api.get<ListResponse>(`/projects${qs({ q, subjectId, sort, status, favorite, tag, page, limit: 18 })}`),
    placeholderData: keepPreviousData,
  });
  const subjectNames = new Map(subjects?.map((s) => [s._id, s.name]));

  return (
    <div>
      <PageHeader eyebrow="Library" title="My Library" description="Every learning project you have created." actions={<ButtonLink to="/create" icon={<Plus className="h-4 w-4" />}>New project</ButtonLink>} />
      <div className="flex flex-col lg:flex-row gap-3 mb-5">
        <form
          className="flex-1 min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            setParam('q', search.trim());
          }}
        >
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title, keyword or tag…" aria-label="Search projects" />
        </form>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:w-[640px] lg:shrink-0">
          <Select aria-label="Filter by subject" value={subjectId} onChange={(e) => setParam('subjectId', e.target.value)}>
            <option value="">All subjects</option>
            {subjects?.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter by status" value={status} onChange={(e) => setParam('status', e.target.value)}>
            <option value="">Any status</option>
            <option value="ready">Ready</option>
            <option value="awaiting_review">Awaiting review</option>
            <option value="generating">Generating</option>
            <option value="source_added">Source added</option>
            <option value="failed">Failed</option>
            <option value="empty">Empty</option>
          </Select>
          <Select aria-label="Favorites" value={favorite} onChange={(e) => setParam('favorite', e.target.value)}>
            <option value="">All projects</option>
            <option value="true">Favorites</option>
          </Select>
          <Select aria-label="Sort" value={sort} onChange={(e) => setParam('sort', e.target.value)}>
            <option value="recent">Recently updated</option>
            <option value="studied">Recently studied</option>
            <option value="oldest">Oldest</option>
            <option value="title">Title A–Z</option>
          </Select>
        </div>
      </div>
      {tag && (
        <div className="mb-4">
          <Badge tone="primary">
            #{tag}{' '}
            <button onClick={() => setParam('tag', '')} aria-label="Clear tag filter">
              ×
            </button>
          </Badge>
        </div>
      )}

      {isLoading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !data?.projects.length ? (
        <EmptyState icon={<BookOpen className="h-10 w-10" />} title={q || status || favorite || subjectId ? 'No matching projects' : 'Your library is empty'} action={<ButtonLink to="/create">Create a lesson</ButtonLink>}>
          {q || status || favorite || subjectId ? 'Try a different search or clear the filters.' : 'Create your first project to see it here.'}
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-muted mb-3" aria-live="polite">
            {data.total} project{data.total === 1 ? '' : 's'} {isFetching && '· updating…'}
          </p>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.projects.map((p) => (
              <ProjectCard key={p._id} project={p} subjectName={p.subjectId ? subjectNames.get(p.subjectId) : undefined} />
            ))}
          </div>
          {data.pages > 1 && (
            <nav className="flex items-center justify-center gap-2 mt-6" aria-label="Pagination">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>
                Previous
              </Button>
              <span className="text-sm text-muted">
                Page {data.page} of {data.pages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setParam('page', String(page + 1))}>
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
