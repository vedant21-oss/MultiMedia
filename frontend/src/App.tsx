import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AppShell } from '@/components/layout/AppShell';
import { Button, Spinner } from '@/components/ui';
import { errorMessage } from '@/services/api';

import Landing from '@/pages/Landing';
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

/** No sign-up wall: a first visit gets a private guest workspace automatically. */
function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading, startGuest } = useAuth();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (loading || user) return;
    setError('');
    startGuest().catch((err) => setError(errorMessage(err, 'Could not reach the server')));
  }, [loading, user, startGuest, attempt]);

  if (user) return <>{children}</>;
  if (error) {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <p className="text-sm text-danger">{error}</p>
          <Button className="mt-4" onClick={() => setAttempt((a) => a + 1)}>Try again</Button>
        </div>
      </div>
    );
  }
  return <FullPageLoader label="Opening your studio…" />;
}

export default function App() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Navigate to="/app" replace />} />
        <Route path="/register" element={<Navigate to="/app" replace />} />

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
