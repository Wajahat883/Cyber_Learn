import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { ExploreTabs } from '../../components/layout/hubs';
import { useMutation } from '@tanstack/react-query';
import { MessageSquareText, Send } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { Card, PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Alert, Badge, EmptyState } from '../../components/ui/Feedback';
import { Markdown } from '../../components/ui/Markdown';
import { Citations, type AskResponse } from '../lessons/AskPanel';

const EXAMPLES = ['Where did I read about failed logon events?', 'What does normalization do in a SIEM?', 'Which notes mention brute-force attacks?'];

/** Ask My Notes (Roman Urdu section 7): answers only from your own saved material, with sources. */
export function AskPage() {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<{ q: string; a: AskResponse }[]>([]);
  const ask = useMutation({
    mutationFn: (q: string) => api.post<AskResponse>('/ask', { question: q }),
    onSuccess: (a, q) => {
      setHistory((h) => [{ q, a }, ...h]);
      setQuestion('');
    },
  });
  // Questions handed over from the command palette (/ask?q=…) are asked straight away.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const q = params.get('q');
    if (q && q.trim().length >= 3) {
      ask.mutate(q.trim());
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  const submit = (e?: FormEvent, q = question) => {
    e?.preventDefault();
    if (q.trim().length >= 3) ask.mutate(q.trim());
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Explore" description="Questions are answered only from material you have saved. If your notes do not cover something, you will be told — nothing is made up." />
      <ExploreTabs active="ask" />
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={1000}
          placeholder="e.g. Maine IDOR kahan parha tha?"
          aria-label="Your question"
          className="flex-1 min-w-0 h-12 rounded-xl border border-border bg-surface px-4 focus:border-primary focus:outline-none"
        />
        <Button type="submit" size="lg" loading={ask.isPending} disabled={question.trim().length < 3} icon={<Send className="h-4 w-4" />}>
          Ask
        </Button>
      </form>
      {ask.error && (
        <div className="mt-3">
          <Alert tone="error">{errorMessage(ask.error)}</Alert>
        </div>
      )}
      <div className="mt-6 space-y-4">
        {!history.length && (
          <EmptyState icon={<MessageSquareText className="h-10 w-10" />} title="Search across everything you have studied">
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {EXAMPLES.map((x) => (
                <button key={x} className="rounded-full border border-border px-3 py-1 text-xs hover:border-primary hover:text-primary" onClick={() => submit(undefined, x)}>
                  {x}
                </button>
              ))}
            </div>
          </EmptyState>
        )}
        {history.map((h, i) => (
          <Card key={i}>
            <p className="font-semibold">{h.q}</p>
            <Badge tone={h.a.supported ? 'success' : 'warning'} className="my-2">
              {h.a.supported ? 'Answered from your notes' : 'Not covered by your notes'}
            </Badge>
            <Markdown>{h.a.answer}</Markdown>
            <Citations citations={h.a.citations} />
          </Card>
        ))}
      </div>
    </div>
  );
}
