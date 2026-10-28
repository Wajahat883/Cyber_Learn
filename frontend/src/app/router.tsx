import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { AppLayout } from '../components/layout/AppLayout';
import { PageLoader, EmptyState } from '../components/ui/Feedback';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from '../features/auth/AuthPages';
/**
 * Route-level code splitting: every page is its own chunk, fetched on first visit.
 * The auth pages and the layout shell stay in the entry chunk so sign-in paints instantly.
 */
function lazyPage<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K): ReactNode {
  const Component = lazy(async () => ({ default: (await load())[name] as ComponentType }));
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

// One element for both diagram routes so switching diagrams doesn't remount the explorer.
const diagramExplorer = lazyPage(() => import('../features/diagrams/DiagramExplorerPage'), 'DiagramExplorerPage');

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
      { index: true, element: lazyPage(() => import('../features/dashboard/DashboardPage'), 'DashboardPage') },
      { path: 'library', element: lazyPage(() => import('../features/projects/LibraryPage'), 'LibraryPage') },
      { path: 'create', element: lazyPage(() => import('../features/projects/CreateLessonPage'), 'CreateLessonPage') },
      { path: 'projects/:id', element: lazyPage(() => import('../features/projects/ProjectPage'), 'ProjectPage') },
      { path: 'subjects', element: lazyPage(() => import('../features/subjects/SubjectsPage'), 'SubjectsPage') },
      { path: 'generations/:id', element: lazyPage(() => import('../features/generation/GenerationPage'), 'GenerationPage') },
      { path: 'lessons/:id', element: lazyPage(() => import('../features/lessons/LessonViewerPage'), 'LessonViewerPage') },
      { path: 'lessons/:id/diagrams', element: diagramExplorer },
      { path: 'lessons/:id/diagrams/:diagramId', element: diagramExplorer },
      { path: 'lessons/:id/gallery', element: lazyPage(() => import('../features/media/GalleryPage'), 'GalleryPage') },
      { path: 'lessons/:id/present', element: lazyPage(() => import('../features/presentations/PlayerPage'), 'PlayerPage') },
      { path: 'presentations', element: lazyPage(() => import('../features/presentations/PresentationsPage'), 'PresentationsPage') },
      { path: 'revision', element: lazyPage(() => import('../features/revision/RevisionCenterPage'), 'RevisionCenterPage') },
      { path: 'progress', element: lazyPage(() => import('../features/progress/ProgressPage'), 'ProgressPage') },
      { path: 'settings', element: lazyPage(() => import('../features/settings/SettingsPage'), 'SettingsPage') },
      { path: 'ask', element: lazyPage(() => import('../features/ask/AskPage'), 'AskPage') },
      { path: 'knowledge-graph', element: lazyPage(() => import('../features/knowledge/KnowledgeGraphPage'), 'KnowledgeGraphPage') },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

