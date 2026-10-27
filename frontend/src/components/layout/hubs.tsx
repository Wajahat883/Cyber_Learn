import { SectionTabs } from '../ui/Card';

/** Tabs shared by the pages grouped under one sidebar destination. */
export function LibraryTabs({ active }: { active: 'projects' | 'presentations' | 'subjects' }) {
  return (
    <SectionTabs
      active={active}
      tabs={[
        { id: 'projects', label: 'Projects', to: '/library' },
        { id: 'presentations', label: 'Presentations', to: '/presentations' },
        { id: 'subjects', label: 'Subjects & paths', to: '/subjects' },
      ]}
    />
  );
}

export function ExploreTabs({ active }: { active: 'ask' | 'graph' }) {
  return (
    <SectionTabs
      active={active}
      tabs={[
        { id: 'ask', label: 'Ask my notes', to: '/ask' },
        { id: 'graph', label: 'Knowledge graph', to: '/knowledge-graph' },
      ]}
    />
  );
}
