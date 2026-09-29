import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AppShell } from '@/components/layout/AppShell';
import { Spinner } from '@/components/ui';

import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Dashboard from '@/pages/Dashboard';

// Studio pages are split out so the first paint after login stays small.
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail'));
const MediaDetail = lazy(() => import('@/pages/MediaDetail'));
const CreateContent = lazy(() => import('@/pages/CreateContent'));
const VideoStudio = lazy(() => import('@/pages/VideoStudio'));
const AudioStudio = lazy(() => import('@/pages/AudioStudio'));
const ImageStudio = lazy(() => import('@/pages/ImageStudio'));
const DocumentStudio = lazy(() => import('@/pages/DocumentStudio'));
const ChatPage = lazy(() => import('@/pages/ChatPage'));
const LibraryPage = lazy(() => import('@/pages/LibraryPage'));
const PlannerPage = lazy(() => import('@/pages/PlannerPage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const NotFound = lazy(() => import('@/pages/NotFound'));

function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Spinner label={label} />
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader label="Restoring your session…" />;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  return user ? <Navigate to="/app" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />

        <Route element={<Protected><AppShell /></Protected>}>
          <Route path="/app" element={<Dashboard />} />
          <Route path="/app/projects/:projectId" element={<ProjectDetail />} />
          <Route path="/app/media/:mediaId" element={<MediaDetail />} />
          <Route path="/app/create" element={<CreateContent />} />
          <Route path="/app/video" element={<VideoStudio />} />
          <Route path="/app/video/:mediaId" element={<VideoStudio />} />
          <Route path="/app/audio" element={<AudioStudio />} />
          <Route path="/app/image" element={<ImageStudio />} />
          <Route path="/app/documents" element={<DocumentStudio />} />
          <Route path="/app/chat" element={<ChatPage />} />
          <Route path="/app/library" element={<LibraryPage />} />
          <Route path="/app/planner" element={<PlannerPage />} />
          <Route path="/app/analytics" element={<AnalyticsPage />} />
          <Route path="/app/settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
