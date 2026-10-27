import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { AppLayout } from '../components/layout/AppLayout';
import { PageLoader, EmptyState } from '../components/ui/Feedback';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from '../features/auth/AuthPages';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { CreateLessonPage } from '../features/projects/CreateLessonPage';
import { LibraryPage } from '../features/projects/LibraryPage';
import { ProjectPage } from '../features/projects/ProjectPage';
import { SubjectsPage } from '../features/subjects/SubjectsPage';
import { GenerationPage } from '../features/generation/GenerationPage';
import { LessonViewerPage } from '../features/lessons/LessonViewerPage';
import { DiagramExplorerPage } from '../features/diagrams/DiagramExplorerPage';
import { GalleryPage } from '../features/media/GalleryPage';
import { PlayerPage } from '../features/presentations/PlayerPage';
import { PresentationsPage } from '../features/presentations/PresentationsPage';
import { RevisionCenterPage } from '../features/revision/RevisionCenterPage';
import { ProgressPage } from '../features/progress/ProgressPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { AskPage } from '../features/ask/AskPage';
import { KnowledgeGraphPage } from '../features/knowledge/KnowledgeGraphPage';

const lazyPage = (load: () => Promise<{ default: React.ComponentType }>) => {
  const Component = lazy(load);
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
};

function NotFound(): ReactNode {
  return (
    <EmptyState title="Page not found" action={<Link to="/" className="text-primary">Back to dashboard</Link>}>
      The page you are looking for does not exist.
    </EmptyState>
  );
}

/** Friendly error screen instead of a stack trace (details stay in the console). */
function RouteError() {
  const error = useRouteError();
  console.error(error);
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : 'Something went wrong while showing this page.';
  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <EmptyState
        title="This page hit a problem"
        action={
          <div className="flex gap-3">
            <button className="text-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <a href="/" className="text-primary">
              Dashboard
            </a>
          </div>
        }
      >
        {message} Your data is safe.
      </EmptyState>
    </div>
  );
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'library', element: <LibraryPage /> },
      { path: 'create', element: <CreateLessonPage /> },
      { path: 'projects/:id', element: <ProjectPage /> },
      { path: 'subjects', element: <SubjectsPage /> },
      { path: 'generations/:id', element: <GenerationPage /> },
      { path: 'lessons/:id', element: <LessonViewerPage /> },
      { path: 'lessons/:id/diagrams', element: <DiagramExplorerPage /> },
      { path: 'lessons/:id/diagrams/:diagramId', element: <DiagramExplorerPage /> },
      { path: 'lessons/:id/gallery', element: <GalleryPage /> },
      { path: 'lessons/:id/present', element: <PlayerPage /> },
      { path: 'presentations', element: <PresentationsPage /> },
      { path: 'revision', element: <RevisionCenterPage /> },
      { path: 'progress', element: <ProgressPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'ask', element: <AskPage /> },
      { path: 'knowledge-graph', element: <KnowledgeGraphPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export { lazyPage };
