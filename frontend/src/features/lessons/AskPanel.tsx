import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { MessageSquareText, Send } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { Markdown } from '../../components/ui/Markdown';
import { Button } from '../../components/ui/Button';
import { Alert, Badge } from '../../components/ui/Feedback';

export interface AskResponse {
  answer: string;
  supported: boolean;
  citations: { sourceId: string; sourceTitle: string; lessonId: string | null; lessonTitle: string | null; heading: string; page: number; excerpt: string }[];
}

export function Citations({ citations }: { citations: AskResponse['citations'] }) {
  if (!citations.length) return null;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs uppercase tracking-wider text-muted">Sources</p>
      {citations.map((c, i) => (
        <div key={i} className="rounded-lg border border-border p-2 text-xs">
          <p className="font-medium text-text">
            {c.lessonId ? (
              <Link to={`/lessons/${c.lessonId}`} className="text-primary hover:underline">
                {c.lessonTitle ?? c.sourceTitle}
              </Link>
            ) : (
              c.sourceTitle
            )}
            {c.heading && <span className="text-muted"> · {c.heading}</span>}
            {c.page > 0 && <span className="text-muted"> · page {c.page}</span>}
          </p>
          <p className="text-muted mt-1 line-clamp-3">{c.excerpt}</p>
        </div>
      ))}
    </div>
  );
}

/** "Ask AI about this section": answers grounded in the lesson's own source material. */
export function AskPanel({ lessonId, sectionId, sectionTitle }: { lessonId: string; sectionId?: string; sectionTitle?: string }) {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<{ q: string; a: AskResponse }[]>([]);
  const ask = useMutation({
    mutationFn: (q: string) => api.post<AskResponse>('/ask', { question: q, lessonId, sectionId }),
    onSuccess: (a, q) => {
      setHistory((h) => [{ q, a }, ...h].slice(0, 5));
      setQuestion('');
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (question.trim().length >= 3) ask.mutate(question.trim());
  };
  return (
    <div>
      <p className="text-sm font-semibold flex items-center gap-2 mb-2">
        <MessageSquareText className="h-4 w-4 text-primary" /> Ask about {sectionTitle ? `“${sectionTitle}”` : 'this lesson'}
      </p>
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a follow-up question…"
          aria-label="Question"
          maxLength={1000}
          className="flex-1 min-w-0 h-9 rounded-lg border border-border bg-bg/60 px-3 text-sm focus:border-primary focus:outline-none"
        />
        <Button type="submit" size="icon" loading={ask.isPending} disabled={question.trim().length < 3} aria-label="Ask">
          {!ask.isPending && <Send className="h-4 w-4" />}
        </Button>
      </form>
      {ask.error && (
        <div className="mt-2">
          <Alert tone="error">{errorMessage(ask.error)}</Alert>
        </div>
      )}
      <div className="mt-3 space-y-4">
        {history.map((h, i) => (
          <div key={i} className="text-sm">
            <p className="font-medium">{h.q}</p>
            <Badge tone={h.a.supported ? 'success' : 'warning'} className="my-1">
              {h.a.supported ? 'From your notes' : 'Not covered by your notes'}
            </Badge>
            <Markdown className="text-sm">{h.a.answer}</Markdown>
            <Citations citations={h.a.citations} />
          </div>
        ))}
      </div>
    </div>
  );
}
