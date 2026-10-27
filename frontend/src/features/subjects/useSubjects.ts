import { createContext, createElement, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import type { Subject } from '../../types/models';

export function useSubjects() {
  return useQuery({
    queryKey: ['subjects'],
    queryFn: async () => (await api.get<{ subjects: Subject[] }>('/subjects')).subjects,
  });
}

interface WorkspaceValue {
  /** Selected subject id, or '' for all subjects. */
  workspaceId: string;
  setWorkspaceId: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceValue>({ workspaceId: '', setWorkspaceId: () => undefined });

/** The "current workspace" from the top navigation (spec 4.2): a subject that scopes the library. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaceId, setWorkspaceId] = useLocalStorage('cl.workspace', '');
  return createElement(WorkspaceContext.Provider, { value: { workspaceId, setWorkspaceId } }, children);
}

export const useWorkspace = () => useContext(WorkspaceContext);
