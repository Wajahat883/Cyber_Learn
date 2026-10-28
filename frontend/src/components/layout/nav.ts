import { BookOpen, Compass, GraduationCap, Home, TrendingUp } from 'lucide-react';

/**
 * Five destinations instead of eleven. Related screens live inside each
 * destination as tabs, so every page is still one or two clicks away.
 */
export const NAV = [
  { to: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { to: '/library', label: 'Library', icon: BookOpen, match: (p: string) => /^\/(library|projects|presentations|subjects|lessons|generations)/.test(p) },
  { to: '/revision', label: 'Study', icon: GraduationCap, match: (p: string) => p.startsWith('/revision') },
  { to: '/progress', label: 'Progress', icon: TrendingUp, match: (p: string) => p.startsWith('/progress') },
  { to: '/ask', label: 'Explore', icon: Compass, match: (p: string) => p.startsWith('/ask') || p.startsWith('/knowledge-graph') },
];
