import { useEffect, useRef } from 'react';

/** Reports focused study time for a lesson in ~1 minute batches (and the remainder on leave). */
export function useStudyTimer(lessonId: string | undefined, onTick: (seconds: number) => void) {
  const tick = useRef(onTick);
  tick.current = onTick;
  useEffect(() => {
    if (!lessonId) return;
    let seconds = 0;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && document.hasFocus()) seconds += 5;
      if (seconds >= 60) {
        tick.current(seconds);
        seconds = 0;
      }
    }, 5000);
    return () => {
      clearInterval(interval);
      if (seconds >= 15) tick.current(seconds);
    };
  }, [lessonId]);
}
