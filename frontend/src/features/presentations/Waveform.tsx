import { useEffect, useRef } from 'react';
import type { NarrationHandle } from './useNarration';

/**
 * Live voice waveform. Real levels for stored audio; for the browser voice a
 * speech-like pattern while it talks. Updated by refs, never by React renders.
 */
export function Waveform({ narration, active }: { narration: NarrationHandle; active: boolean }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    const draw = (now: number) => {
      const speaking = active && narration.speaking();
      const levels = narration.levels();
      bars.current.forEach((bar, i) => {
        if (!bar) return;
        const synthetic = 0.35 + 0.65 * Math.abs(Math.sin(now / (110 + i * 17) + i * 1.7) * Math.sin(now / 370 + i));
        const v = speaking ? (levels ? Math.max(0.08, levels[i] ?? 0) : synthetic) : 0.08;
        bar.style.transform = `scaleY(${v.toFixed(3)})`;
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [narration, active]);
  if (!active) return null;
  return (
    <div className="absolute right-[2.5%] top-[4%] flex h-[6%] min-h-5 items-center gap-[3px] rounded-full bg-black/50 px-3 py-1 backdrop-blur pointer-events-none" aria-hidden="true">
      {Array.from({ length: 16 }, (_, i) => (
        <span key={i} ref={(el) => void (bars.current[i] = el)} className="block h-full w-[3px] origin-center rounded-full bg-primary" style={{ transform: 'scaleY(0.08)', transition: 'transform 80ms linear' }} />
      ))}
    </div>
  );
}

