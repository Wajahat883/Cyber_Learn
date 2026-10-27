import { useMemo } from 'react';
import { useTheme } from './useTheme';

const read = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * Concrete token colours for libraries that cannot read CSS variables
 * (SVG presentation attributes, chart libraries). Recomputed when the theme changes.
 */
export function useThemeColors() {
  const { resolved } = useTheme();
  return useMemo(
    () => ({
      mode: resolved,
      primary: read('--primary'),
      secondary: read('--secondary'),
      muted: read('--muted'),
      border: read('--border'),
      surface: read('--surface'),
      surface2: read('--surface-2'),
      text: read('--text'),
      bg: read('--bg'),
      error: read('--error'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolved],
  );
}
