import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { BookMarked, Image as ImageIcon, Layers, ListChecks, Network, Sparkles, Tags, X } from 'lucide-react';
import { STAGE_LABELS, type ContentAnalysis, type GenerationPreferences, type GenerationStage } from '@cyberlearn/shared';
import { api, errorMessage } from '../../lib/api';
import { Card, CardTitle, PageHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { Alert, Badge } from '../../components/ui/Feedback';
import { cn } from '../../lib/cn';

const DIAGRAM_TYPES = ['flowchart', 'architecture', 'data-flow', 'entity-relationship', 'sequence', 'concept-map', 'decision-flow'];

/** Screen 3 — Content Analysis Preview: correct the plan before expensive media generation. */
export function AnalysisPreview({
  generationId,
  analysis: initial,
  preferences,
  onContinued,
  onCancel,
}: {
  generationId: string;
  analysis: ContentAnalysis;
  preferences: GenerationPreferences;
  onContinued: () => void;
  onCancel: () => void;
}) {
  const [analysis, setAnalysis] = useState(initial);
  const included = analysis.sections.filter((s) => s.include);
  const includedIds = new Set(included.map((s) => s.id));
  const visuals = analysis.visuals.filter((v) => includedIds.has(v.sectionId));
  const diagrams = preferences.visualMode === 'illustrations' ? [] : visuals.filter((v) => DIAGRAM_TYPES.includes(v.type));
  const illustrations = preferences.visualMode === 'diagrams' ? [] : visuals.filter((v) => v.type === 'conceptual-image');
  const stages: GenerationStage[] = ['lesson', ...(preferences.quizzes || preferences.flashcards ? (['assessment'] as const) : []), ...(diagrams.length ? (['diagrams'] as const) : []), ...(preferences.visualMode !== 'diagrams' ? (['images'] as const) : []), 'presentation', ...(preferences.narration ? (['narration'] as const) : []), 'finalize'];

  const proceed = useMutation({
    mutationFn: () => api.post(`/generations/${generationId}/continue`, { analysis }),
    onSuccess: onContinued,
  });

  const toggle = (id: string) => setAnalysis({ ...analysis, sections: analysis.sections.map((s) => (s.id === id ? { ...s, include: !s.include } : s)) });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Step 2 of 3 · Review the plan"
        title="Content analysis"
        description="Check the plan before diagrams, illustrations and narration are generated. Edit the title or remove sections you do not need; everything else is automatic."
        actions={
          <>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button icon={<Sparkles className="h-4 w-4" />} loading={proceed.isPending} disabled={!included.length || !analysis.title.trim()} onClick={() => proceed.mutate()}>
              Generate lesson
            </Button>
          </>
        }
      />
      {proceed.error && <Alert tone="error">{errorMessage(proceed.error)}</Alert>}
      {analysis.warnings.map((w) => (
        <Alert key={w} tone="warning">
          {w}
        </Alert>
      ))}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Lesson title" value={analysis.title} onChange={(e) => setAnalysis({ ...analysis, title: e.target.value.slice(0, 200) })} />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted">Detected subject</p>
                  <p className="font-semibold mt-1">{analysis.subject}</p>
                </div>
                <div>
                  <p className="text-muted">Main topic</p>
                  <p className="font-semibold mt-1">{analysis.mainTopic}</p>
                </div>
                <div>
                  <p className="text-muted">Difficulty</p>
                  <p className="font-semibold mt-1 capitalize">{analysis.difficulty}</p>
                </div>
                <div>
                  <p className="text-muted">Suggested slides</p>
                  <p className="font-semibold mt-1">{analysis.suggestedSlideCount}</p>
                </div>
              </div>
            </div>
            {analysis.summary && <p className="text-sm text-muted mt-4">{analysis.summary}</p>}
          </Card>

          <Card>
            <CardTitle icon={<ListChecks className="h-4 w-4" />} action={<span className="text-sm text-muted">{included.length} of {analysis.sections.length} included</span>}>
              Subtopics
            </CardTitle>
            <ul className="space-y-2">
              {analysis.sections.map((s, i) => (
                <li key={s.id} className={cn('rounded-lg border p-3 transition-opacity', s.include ? 'border-border' : 'border-dashed border-border opacity-50')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        <span className="text-muted mr-2">{i + 1}.</span>
                        {s.title}
                      </p>
                      {s.concepts.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {s.concepts.map((c) => (
                            <Badge key={c}>{c}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button size="sm" variant={s.include ? 'ghost' : 'outline'} onClick={() => toggle(s.id)} aria-pressed={!s.include} icon={s.include ? <X className="h-4 w-4" /> : undefined}>
                      {s.include ? 'Remove' : 'Include'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardTitle icon={<Tags className="h-4 w-4" />}>Important terms</CardTitle>
            {analysis.keyTerms.length ? (
              <dl className="grid sm:grid-cols-2 gap-3 text-sm">
                {analysis.keyTerms.map((t) => (
                  <div key={t.term} className="rounded-lg bg-surface-2 p-3">
                    <dt className="font-semibold text-primary">{t.term}</dt>
                    <dd className="text-muted mt-1">{t.definition || '—'}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted">No specific terms detected.</p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardTitle icon={<Network className="h-4 w-4" />}>Proposed diagrams</CardTitle>
            {diagrams.length ? (
              <ul className="space-y-2 text-sm">
                {diagrams.map((v) => (
                  <li key={v.id}>
                    <Badge tone="primary">{v.type}</Badge> <span className="text-muted">{analysis.sections.find((s) => s.id === v.sectionId)?.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">None for this material{preferences.visualMode === 'illustrations' ? ' (illustrations only)' : ''}.</p>
            )}
          </Card>
          <Card>
            <CardTitle icon={<ImageIcon className="h-4 w-4" />}>Proposed illustrations</CardTitle>
            {preferences.visualMode === 'diagrams' ? (
              <p className="text-sm text-muted">Disabled (diagrams only).</p>
            ) : (
              <p className="text-sm text-muted">{Math.max(1, illustrations.length)} conceptual illustration{illustrations.length > 1 ? 's' : ''}. Exact technical details stay in diagrams and text labels.</p>
            )}
          </Card>
          <Card>
            <CardTitle icon={<BookMarked className="h-4 w-4" />}>Prerequisites</CardTitle>
            {analysis.prerequisites.length ? (
              <ul className="list-disc pl-5 text-sm space-y-1">
                {analysis.prerequisites.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">None identified.</p>
            )}
          </Card>
          <Card>
            <CardTitle icon={<Layers className="h-4 w-4" />}>Generation stages</CardTitle>
            <ol className="text-sm space-y-1 list-decimal pl-5 text-muted">
              {stages.map((s) => (
                <li key={s}>{STAGE_LABELS[s]}</li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
