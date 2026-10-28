import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LessonSection } from '@cyberlearn/shared';
import { api } from '../../lib/api';
import type { Lesson } from '../../types/models';
import { cleanSection } from './cleanSection';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Debounced autosave for lesson edits (spec 17).
 * - A pending edit is flushed (saved immediately) when the lesson changes or the editor unmounts.
 * - Every request gets a sequence number; a response that arrives after a newer request was
 *   sent is ignored, so an older lesson can never overwrite newer text in the cache.
 * - While anything is unsaved, closing or reloading the tab asks for confirmation.
 */
export function useLessonAutosave(lessonId: string | undefined, delayMs = 1500) {
  const qc = useQueryClient();
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Sections edited but not yet sent (or whose last save failed). */
  const pending = useRef<{ lessonId: string; sections: LessonSection[] } | null>(null);
  const seq = useRef(0);
  const inFlight = useRef(0);

  const send = useCallback(
    async (target: string, sections: LessonSection[]) => {
      clearTimeout(timer.current);
      if (pending.current?.sections === sections) pending.current = null;
      const mine = ++seq.current;
      inFlight.current++;
      setSaveState('saving');
      try {
        const res = await api.patch<{ lesson: Lesson }>(`/lessons/${target}`, { sections: sections.map(cleanSection) });
        if (mine !== seq.current) return; // a newer save was sent meanwhile; its response wins
        qc.setQueryData(['lesson', target], res.lesson);
        setSaveState('saved');
      } catch {
        if (mine !== seq.current) return;
        pending.current ??= { lessonId: target, sections };
        setSaveState('error');
      } finally {
        inFlight.current--;
      }
    },
    [qc],
  );
  const sendRef = useRef(send);
  sendRef.current = send;

  /** Queue a save of these sections after the debounce delay. */
  const schedule = useCallback(
    (sections: LessonSection[]) => {
      if (!lessonId) return;
      pending.current = { lessonId, sections };
      setSaveState('idle');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void sendRef.current(lessonId, sections), delayMs);
    },
    [lessonId, delayMs],
  );

  /** Save these sections now (e.g. "Done editing"), cancelling any queued save. */
  const saveNow = useCallback(
    async (sections: LessonSection[]) => {
      if (!lessonId) return;
      await sendRef.current(lessonId, sections);
    },
    [lessonId],
  );

  /** Send the queued edit right away, if there is one. */
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const p = pending.current;
    if (p) return sendRef.current(p.lessonId, p.sections);
    return Promise.resolve();
  }, []);

  // Leaving the lesson (route change or unmount) must not drop the last edit.
  useEffect(() => {
    return () => {
      void flush();
    };
  }, [lessonId, flush]);

  // Warn before closing/reloading the tab while an edit is queued, failed or still in flight.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!pending.current && inFlight.current === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return { saveState, schedule, saveNow, flush };
}
