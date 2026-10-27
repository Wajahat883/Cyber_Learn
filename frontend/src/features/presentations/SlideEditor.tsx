import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import type { Caption, Slide } from '@cyberlearn/shared';
import { api, errorMessage } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Field';
import { Alert, Badge } from '../../components/ui/Feedback';
import type { Presentation } from '../../types/models';

const MS_PER_WORD = 400;

/** Same estimated timing the backend uses, so edited narration stays in sync. */
function recaption(text: string): { captions: Caption[]; endMs: number } {
  const sentences = (text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);
  let t = 600;
  const captions = sentences.map((s) => {
    const duration = Math.max(1200, s.split(' ').length * MS_PER_WORD);
    const c = { startMs: t, endMs: t + duration, text: s.slice(0, 500) };
    t += duration;
    return c;
  });
  return { captions, endMs: t };
}

/** Edit slide text, narration and order after generation (spec 5.8: the presentation remains editable). */
export function SlideEditor({ presentation, onClose, onSaved }: { presentation: Presentation; onClose: () => void; onSaved: (p: Presentation) => void }) {
  const [slides, setSlides] = useState<Slide[]>(presentation.manifest.slides);
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const save = useMutation({
    mutationFn: () => api.patch<{ presentation: Presentation }>(`/presentations/${presentation._id}`, { slides }),
    onSuccess: (r) => {
      onSaved(r.presentation);
      onClose();
    },
  });
  const update = (patch: Partial<Slide>) => setSlides(slides.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const move = (dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[index], next[j]] = [next[j], next[index]];
    setSlides(next);
    setIndex(j);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit slides"
      wide
      footer={
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Save presentation
        </Button>
      }
    >
      {save.error && <Alert tone="error">{errorMessage(save.error)}</Alert>}
      <div className="grid md:grid-cols-[200px_1fr] gap-4">
        <ol className="space-y-1 max-h-[60vh] overflow-y-auto">
          {slides.map((s, i) => (
            <li key={s.id}>
              <button onClick={() => setIndex(i)} className={`w-full text-left text-sm rounded-md px-2 py-1.5 ${i === index ? 'bg-primary/10 text-primary' : 'hover:bg-surface-2'}`}>
                {i + 1}. {s.title}
              </button>
            </li>
          ))}
        </ol>
        {slide && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge>{slide.type}</Badge>
              <div className="ml-auto flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => move(-1)} aria-label="Move slide up" disabled={index === 0}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => move(1)} aria-label="Move slide down" disabled={index === slides.length - 1}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete slide"
                  disabled={slides.length <= 1}
                  onClick={() => {
                    setSlides(slides.filter((_, i) => i !== index));
                    setIndex(Math.max(0, index - 1));
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Input label="Title" value={slide.title} onChange={(e) => update({ title: e.target.value.slice(0, 200) })} />
            <Input label="Subtitle" value={slide.subtitle} onChange={(e) => update({ subtitle: e.target.value.slice(0, 300) })} />
            {slide.bullets.map((b, i) => (
              <Textarea
                key={b.id}
                label={`Point ${i + 1}`}
                className="[&_textarea]:min-h-[60px]"
                value={b.text}
                onChange={(e) => update({ bullets: slide.bullets.map((x, j) => (j === i ? { ...x, text: e.target.value.slice(0, 600) || x.text } : x)) })}
              />
            ))}
            {slide.annotations.map((a, i) => (
              <Input key={a.id} label={`Illustration label ${i + 1}`} value={a.label} onChange={(e) => update({ annotations: slide.annotations.map((x, j) => (j === i ? { ...x, label: e.target.value.slice(0, 80) || x.label } : x)) })} />
            ))}
            <Textarea
              label="Narration"
              hint="captions and timing update automatically"
              value={slide.narration.text}
              onChange={(e) => {
                const text = e.target.value.slice(0, 5000);
                const { captions, endMs } = recaption(text);
                update({ narration: { ...slide.narration, text, captions, audioAssetId: undefined, timing: 'estimated' }, durationMs: Math.min(180000, Math.max(slide.durationMs, endMs + 1500)) });
              }}
            />
            {slide.narration.audioAssetId && <p className="text-xs text-muted">Editing the narration switches this slide to browser speech until narration is regenerated.</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}
