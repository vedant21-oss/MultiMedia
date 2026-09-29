import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, FileStack, MessageSquare, Sparkles, Upload as UploadIcon, Video } from 'lucide-react';
import { mediaApi, projectApi } from '@/services/endpoints';
import { errorMessage } from '@/services/api';
import { useProjectContext } from '@/hooks/useProjectContext';
import { Badge, Button, ConfirmDialog, EmptyState, Skeleton, Tabs } from '@/components/ui';
import { AssetCard, PageHeader, Uploader } from '@/components/shared';
import { formatDuration } from '@/lib/format';
import type { Asset } from '@/types';

type TabId = 'sources' | 'about';

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tab, setTab] = useState<TabId>('sources');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<Asset | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { setActiveProjectId } = useProjectContext();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (projectId) setActiveProjectId(projectId);
  }, [projectId, setActiveProjectId]);

  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectApi.get(projectId!),
    enabled: !!projectId,
  });

  const assets = useQuery({
    queryKey: ['media', projectId],
    queryFn: () => mediaApi.list(projectId!),
    enabled: !!projectId,
    // Poll while anything is still in the pipeline so progress is live.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((a) => a.status === 'processing' || a.status === 'uploaded')
        ? 2500
        : false,
  });

  const processing = (assets.data ?? []).filter(
    (a) => a.status === 'processing' || a.status === 'uploaded',
  ).length;

  // Refresh project-level counters once the queue drains.
  useEffect(() => {
    if (processing === 0) {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    }
  }, [processing, projectId, queryClient]);

  const upload = useMutation({
    mutationFn: (files: File[]) => mediaApi.upload(projectId!, files, setProgress),
    onMutate: () => {
      setUploading(true);
      setProgress(0);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['media', projectId] });
      toast.success(
        `${data.assets.length} file${data.assets.length === 1 ? '' : 's'} queued for analysis`,
      );
      data.skipped?.forEach((s) => toast.warning(`${s.filename}: ${s.reason}`));
    },
    onError: (err) => toast.error(errorMessage(err, 'Upload failed')),
    onSettled: () => {
      setUploading(false);
      setProgress(0);
    },
  });

  const reprocess = useMutation({
    mutationFn: (asset: Asset) => mediaApi.reprocess(asset.id),
    onMutate: (asset) => setBusyId(asset.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media', projectId] });
      toast.info('Re-queued for analysis');
    },
    onError: (err) => toast.error(errorMessage(err)),
    onSettled: () => setBusyId(null),
  });

  const remove = useMutation({
    mutationFn: (asset: Asset) => mediaApi.remove(asset.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setPendingDelete(null);
      toast.success('Source deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (project.isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-5">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (!project.data) {
    return (
      <EmptyState
        icon={FileStack}
        title="Project not found"
        description="It may have been deleted."
        action={
          <Link to="/app">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        }
      />
    );
  }

  const { stats } = project.data;
  const list = assets.data ?? [];

  return (
    <div className="mx-auto max-w-7xl">
      <Link
        to="/app"
        className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-ink-faint hover:text-brand"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All projects
      </Link>

      <PageHeader
        title={project.data.name}
        subtitle={project.data.description || undefined}
        actions={
          <>
            <Link to="/app/chat">
              <Button variant="secondary" size="sm">
                <MessageSquare className="h-4 w-4" /> Ask
              </Button>
            </Link>
            <Link to="/app/video">
              <Button variant="secondary" size="sm">
                <Video className="h-4 w-4" /> Video Studio
              </Button>
            </Link>
            <Link to="/app/create">
              <Button size="sm">
                <Sparkles className="h-4 w-4" /> Create content
              </Button>
            </Link>
          </>
        }
      >
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="neutral">{stats.assets} sources</Badge>
          <Badge tone="success">{stats.ready} ready</Badge>
          {stats.processing > 0 && (
            <Badge tone="brand">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              {stats.processing} processing
            </Badge>
          )}
          {stats.failed > 0 && <Badge tone="danger">{stats.failed} failed</Badge>}
          <Badge tone="neutral">{stats.segments} segments indexed</Badge>
          {stats.duration_sec > 0 && (
            <Badge tone="neutral">{formatDuration(stats.duration_sec)} of media</Badge>
          )}
        </div>
      </PageHeader>

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'sources', label: 'Sources', icon: FileStack, count: list.length },
          { id: 'about', label: 'Project settings', icon: Sparkles },
        ]}
      />

      {tab === 'sources' && (
        <div className="space-y-5">
          <Uploader
            onFiles={(files) => upload.mutate(files)}
            uploading={uploading}
            progress={progress}
          />

          {assets.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-72" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={UploadIcon}
              title="No sources yet"
              description="Upload a video and a PDF that cover the same subject — then ask a question and watch the answer draw on both."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  busy={busyId === asset.id}
                  onReprocess={(a) => reprocess.mutate(a)}
                  onDelete={setPendingDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'about' && <ProjectSettings projectId={projectId!} />}

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete)}
        title={`Delete “${pendingDelete?.original_filename}”?`}
        body="The file, its extracted segments and its embeddings are removed. Generated content that cited it is kept, but its citations will no longer resolve."
        confirmLabel="Delete source"
        loading={remove.isPending}
      />
    </div>
  );
}

function ProjectSettings({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['project', projectId], queryFn: () => projectApi.get(projectId) });
  const [form, setForm] = useState({ name: '', description: '', context: '' });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (data) setForm({ name: data.name, description: data.description, context: data.context });
  }, [data]);

  const save = useMutation({
    mutationFn: () => projectApi.update(projectId, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const destroy = useMutation({
    mutationFn: () => projectApi.remove(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted');
      navigate('/app');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="max-w-2xl space-y-5">
      <div className="card space-y-4 p-5">
        <div>
          <label className="label" htmlFor="pname">
            Project name
          </label>
          <input
            id="pname"
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="pdesc">
            Description
          </label>
          <input
            id="pdesc"
            className="input"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="pctx">
            Context for the AI
          </label>
          <textarea
            id="pctx"
            className="input min-h-[120px] resize-y"
            value={form.context}
            onChange={(e) => setForm({ ...form, context: e.target.value })}
          />
          <p className="mt-1 text-xs text-ink-faint">
            Injected into every generation prompt for this project — audience, purpose, anything the
            model should assume.
          </p>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Save changes
          </Button>
        </div>
      </div>

      <div className="card border-danger/30 p-5">
        <h3 className="text-sm font-semibold text-danger">Danger zone</h3>
        <p className="mt-1 text-[13px] text-ink-muted">
          Deleting a project removes every file, segment and generated draft inside it.
        </p>
        <Button variant="danger" className="mt-4" onClick={() => setConfirmDelete(true)}>
          Delete this project
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => destroy.mutate()}
        title={`Delete “${data?.name}”?`}
        body="Everything in this project is permanently removed. This cannot be undone."
        confirmLabel="Delete project"
        loading={destroy.isPending}
      />
    </div>
  );
}
