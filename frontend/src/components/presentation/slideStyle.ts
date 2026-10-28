import type { CSSProperties } from 'react';

/** Interaction passed down from the player; absent in static previews. */
export interface StageInteraction {
  selectedNode?: string | null;
  onNodeClick?: (id: string) => void;
  onCloseDetails?: () => void;
}

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const W = 1280;
export const H = 720;

/** Opacity/offset style for an element at its reveal progress. */
export function appear(amount: number, highlighted = false, dimmed = false): CSSProperties {
  return {
    opacity: dimmed ? 0.35 : amount,
    transform: `translateY(${(1 - amount) * 18}px)`,
    transition: 'box-shadow 300ms, border-color 300ms, background-color 300ms',
    ...(highlighted ? { boxShadow: '0 0 0 2px #38BDF8, 0 0 28px rgba(56,189,248,0.45)', borderColor: '#38BDF8', backgroundColor: 'rgba(56,189,248,0.08)' } : {}),
  };
}
