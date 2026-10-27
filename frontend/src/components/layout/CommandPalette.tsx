import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, CornerDownLeft, FolderKanban, GraduationCap, Home, Layers, MessageSquareText, MonitorPlay, Network, Plus, Search, Settings, TrendingUp } from 'lucide-react';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';

interface Item {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: ReactNode;
  run: () => void;
}

interface LessonRow {
  _id: string;
  title: string;
  subject: string;
  presentation: { _id: string } | null;
}

/** Ctrl/⌘+K: jump to any page or lesson, or start an action, from anywhere. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const { data: lessons } = useQuery({
    queryKey: ['lessons'],
    queryFn: async () => (await api.get<{ lessons: LessonRow[] }>('/lessons')).lessons,
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const go = (to: string) => () => {
    navigate(to);
    onClose();
  };

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const pages: Item[] = [
      { id: 'create', label: 'Create a new lesson', group: 'Actions', icon: <Plus />, run: go('/create') },
      { id: 'home', label: 'Home', group: 'Go to', icon: <Home />, run: go('/') },
      { id: 'library', label: 'Library', group: 'Go to', icon: <BookOpen />, run: go('/library') },
      { id: 'presentations', label: 'Presentations', group: 'Go to', icon: <MonitorPlay />, run: go('/presentations') },
      { id: 'subjects', label: 'Subjects & learning paths', group: 'Go to', icon: <FolderKanban />, run: go('/subjects') },
      { id: 'flashcards', label: 'Study flashcards', group: 'Go to', icon: <Layers />, run: go('/revision?tab=flashcards') },
      { id: 'quizzes', label: 'Take a quiz', group: 'Go to', icon: <GraduationCap />, run: go('/revision?tab=quizzes') },
      { id: 'progress', label: 'Learning progress', group: 'Go to', icon: <TrendingUp />, run: go('/progress') },
      { id: 'ask', label: 'Ask my notes', group: 'Go to', icon: <MessageSquareText />, run: go('/ask') },
      { id: 'graph', label: 'Knowledge graph', group: 'Go to', icon: <Network />, run: go('/knowledge-graph') },
      { id: 'settings', label: 'Settings', group: 'Go to', icon: <Settings />, run: go('/settings') },
    ];
    const lessonItems: Item[] = (lessons ?? []).flatMap((l) => [
      { id: `l-${l._id}`, label: l.title, hint: l.subject || 'Lesson', group: 'Lessons', icon: <BookOpen />, run: go(`/lessons/${l._id}`) },
      ...(l.presentation ? [{ id: `p-${l._id}`, label: `Play “${l.title}”`, hint: 'Presentation', group: 'Lessons', icon: <MonitorPlay />, run: go(`/lessons/${l._id}/present`) }] : []),
    ]);
    const matches = (i: Item) => !q || i.label.toLowerCase().includes(q) || i.hint?.toLowerCase().includes(q);
    const result = [...pages.filter(matches), ...lessonItems.filter(matches).slice(0, 8)];
    if (q) {
      result.push(
        { id: 'search', label: `Search the library for “${query.trim()}”`, group: 'Search', icon: <Search />, run: go(`/library?q=${encodeURIComponent(query.trim())}`) },
        { id: 'ask-q', label: `Ask my notes: “${query.trim()}”`, group: 'Search', icon: <MessageSquareText />, run: go(`/ask?q=${encodeURIComponent(query.trim())}`) },
      );
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, lessons]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;
  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="relative w-full max-w-xl rounded-2xl border border-border bg-surface shadow-pop overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <Search className="h-4 w-4 text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                items[active]?.run();
              } else if (e.key === 'Escape') onClose();
            }}
            placeholder="Search lessons, pages and actions…"
            aria-label="Command search"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={items[active] ? `cmd-${items[active].id}` : undefined}
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
          <kbd className="text-[11px] text-muted border border-border rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul ref={listRef} id="command-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">No matches</li>}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id} role="presentation">
                {header && <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{header}</p>}
                <button
                  id={`cmd-${item.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={item.run}
                  className={cn('w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm [&_svg]:h-4 [&_svg]:w-4', i === active ? 'bg-primary-soft text-text' : 'text-text/90')}
                >
                  <span className={i === active ? 'text-primary' : 'text-muted'}>{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="text-xs text-muted truncate max-w-32">{item.hint}</span>}
                  {i === active && <CornerDownLeft className="text-muted" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
