import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Link } from 'react-router';
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

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    path: '/',
    element: <AppLayout />,
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
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export { lazyPage };
