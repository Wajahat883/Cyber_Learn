import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocalStorage } from './useLocalStorage';

export type ThemeChoice = 'system' | 'light' | 'dark';
type Resolved = 'light' | 'dark';

const media = () => window.matchMedia('(prefers-color-scheme: dark)');
const resolve = (choice: ThemeChoice): Resolved => (choice === 'dark' || (choice === 'system' && media().matches) ? 'dark' : 'light');

interface ThemeValue {
  choice: ThemeChoice;
  resolved: Resolved;
  setChoice: (c: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeValue>({ choice: 'system', resolved: 'light', setChoice: () => undefined });

/** Light/dark/system theme, stored per browser and applied as data-theme on <html>. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useLocalStorage<ThemeChoice>('cl.theme', 'system');
  const [resolved, setResolved] = useState<Resolved>(() => resolve(choice));
  useEffect(() => {
    const apply = () => {
      const next = resolve(choice);
      document.documentElement.setAttribute('data-theme', next);
      setResolved(next);
    };
    apply();
    if (choice !== 'system') return;
    const m = media();
    m.addEventListener('change', apply);
    return () => m.removeEventListener('change', apply);
  }, [choice]);
  return createElement(ThemeContext.Provider, { value: { choice, resolved, setChoice } }, children);
}

export const useTheme = () => useContext(ThemeContext);
