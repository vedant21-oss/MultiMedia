import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { projectApi } from '@/services/endpoints';
import { useAuth } from '@/hooks/useAuth';
import type { Project } from '@/types';

const KEY = 'creatorai.activeProject';

interface ProjectContextValue {
  projects: Project[];
  activeProjectId: string | null;
  activeProject: Project | null;
  setActiveProjectId: (id: string | null) => void;
  loading: boolean;
  refetch: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

/**
 * Most studios operate on "the project you are working in". This keeps that
 * selection in one place and remembers it across reloads.
 */
export function ProjectProvider({ children }: { children: ReactNode }) {
  const [activeProjectId, setActive] = useState<string | null>(
    () => localStorage.getItem(KEY),
  );

  const { user } = useAuth();

  // Only fetch once signed in. An unauthenticated call 401s, and the auth
  // interceptor would then bounce a logged-out visitor off the landing page.
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['projects', user?.id],
    queryFn: projectApi.list,
    enabled: !!user,
  });

  const projects = useMemo(() => data ?? [], [data]);

  // Fall back to the most recent project if the remembered one is gone.
  useEffect(() => {
    if (!projects.length) return;
    if (!activeProjectId || !projects.some((p) => p.id === activeProjectId)) {
      setActive(projects[0].id);
    }
  }, [projects, activeProjectId]);

  const setActiveProjectId = useCallback((id: string | null) => {
    setActive(id);
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  }, []);

  const value = useMemo<ProjectContextValue>(
    () => ({
      projects,
      activeProjectId,
      activeProject: projects.find((p) => p.id === activeProjectId) ?? null,
      setActiveProjectId,
      loading: isLoading,
      refetch,
    }),
    [projects, activeProjectId, setActiveProjectId, isLoading, refetch],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjectContext() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProjectContext must be used inside <ProjectProvider>');
  return ctx;
}
