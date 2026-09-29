import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowRight, Clock, FileStack, FolderPlus, Layers, MessageSquare, Plus, Sparkles,
  Trash2, Video,
} from 'lucide-react';
import { projectApi, studioApi } from '@/services/endpoints';
import { errorMessage } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { useProjectContext } from '@/hooks/useProjectContext';
import {
  Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Input, Skeleton, Textarea,
} from '@/components/ui';
import { PageHeader } from '@/components/shared';
import { formatBytes, formatDuration, relativeTime } from '@/lib/format';
import type { Project } from '@/types';

export default function Dashboard() {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', context: '' });
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const { user } = useAuth();
  const { projects, loading, setActiveProjectId } = useProjectContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const analytics = useQuery({
    queryKey: ['analytics', 'overview', 'dashboard'],
    queryFn: () => studioApi.analytics({ days: 30 }),
  });

  const createProject = useMutation({
    mutationFn: () => projectApi.create(form),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setActiveProjectId(project.id);
      setCreating(false);
      setForm({ name: '', description: '', context: '' });
      toast.success('Project created');
      navigate(`/app/projects/${project.id}`);
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not create the project')),
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => projectApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      setPendingDelete(null);
      toast.success('Project deleted');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not delete the project')),
  });

  const totals = analytics.data?.totals;
  const firstName = user?.full_name?.split(' ')[0] ?? 'there';

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle="Upload media into a project, then turn it into content for any platform."
        actions={
          <>
            <Link to="/app/create">
              <Button variant="secondary">
                <Sparkles className="h-4 w-4" /> Create content
              </Button>
            </Link>
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New project
            </Button>
          </>
        }
      />

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={FileStack}
          label="Sources uploaded"
          value={totals?.assets ?? 0}
          sub={`${totals?.assets_ready ?? 0} ready`}
          loading={analytics.isLoading}
        />
        <StatCard
          icon={Video}
          label="Videos processed"
          value={totals?.videos_processed ?? 0}
          sub={
            analytics.data?.processing.avg_processing_ms
              ? `avg ${(analytics.data.processing.avg_processing_ms / 1000).toFixed(1)}s`
              : undefined
          }
          loading={analytics.isLoading}
        />
        <StatCard
          icon={Sparkles}
          label="Content generated"
          value={totals?.generated_content ?? 0}
          sub={`${totals?.drafts ?? 0} drafts`}
          loading={analytics.isLoading}
        />
        <StatCard
          icon={Layers}
          label="Searchable segments"
          value={totals?.segments_indexed ?? 0}
          sub={totals ? `${formatBytes(totals.storage_used_bytes)} stored` : undefined}
          loading={analytics.isLoading}
        />
      </div>

      {/* Quick actions */}
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <QuickAction
          to="/app/create"
          icon={Sparkles}
          title="Create content"
          body="Captions, scripts, blogs and quizzes from your uploads."
        />
        <QuickAction
          to="/app/chat"
          icon={MessageSquare}
          title="Ask your media"
          body="Grounded answers with citations to timestamps and pages."
        />
        <QuickAction
          to="/app/video"
          icon={Video}
          title="Cut clips"
          body="Highlights, vertical reframing and burned-in subtitles."
        />
      </div>

      {/* Projects */}
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink-faint">Your projects</h2>
        <div className="h-px flex-1 bg-line" />
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="No projects yet"
          description="A project holds a set of related uploads — one video and its slides, or a whole podcast season. Everything inside it is searchable together."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Create your first project
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={() => {
                setActiveProjectId(project.id);
                navigate(`/app/projects/${project.id}`);
              }}
              onDelete={() => setPendingDelete(project)}
            />
          ))}
        </div>
      )}

      {/* New project dialog */}
      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New project"
        description="Give it a name and, optionally, context the AI should keep in mind for every generation."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createProject.mutate()}
              loading={createProject.isPending}
              disabled={form.name.trim().length < 2}
            >
              Create project
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            id="project-name"
            label="Project name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Neural Networks — Lecture 4"
            autoFocus
          />
          <Input
            id="project-desc"
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Optional"
          />
          <Textarea
            id="project-context"
            label="Context for the AI"
            value={form.context}
            onChange={(e) => setForm({ ...form, context: e.target.value })}
            placeholder="Who the audience is, what the material covers, anything the model should assume. This is injected into every generation prompt for this project."
            hint="Optional, but it noticeably improves output quality."
          />
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteProject.mutate(pendingDelete.id)}
        title={`Delete “${pendingDelete?.name}”?`}
        body="This permanently removes the project, every uploaded file, all extracted segments and all generated content. It cannot be undone."
        confirmLabel="Delete project"
        loading={deleteProject.isPending}
      />
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, sub, loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-ink-faint">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-16" />
      ) : (
        <div className="mt-1.5 text-2xl font-bold text-ink">{value.toLocaleString()}</div>
      )}
      {sub && <div className="mt-0.5 text-[11px] text-ink-faint">{sub}</div>}
    </Card>
  );
}

function QuickAction({
  to, icon: Icon, title, body,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <Link
      to={to}
      className="card group flex items-start gap-3 p-4 transition-colors hover:border-brand/45"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/12 text-brand">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">{body}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
    </Link>
  );
}

function ProjectCard({
  project, onOpen, onDelete,
}: {
  project: Project;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { stats } = project;
  const modalities = Object.entries(stats.by_modality).filter(([, n]) => n > 0);

  return (
    <Card className="group relative flex flex-col p-5 transition-colors hover:border-brand/40">
      <button
        onClick={onDelete}
        className="absolute right-3 top-3 rounded-md p-1.5 text-ink-faint opacity-0 transition-all hover:bg-danger/10 hover:text-danger focus:opacity-100 group-hover:opacity-100"
        title="Delete project"
        aria-label={`Delete ${project.name}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      <button onClick={onOpen} className="block text-left">
        <h3 className="pr-7 text-base font-semibold text-ink group-hover:text-brand">
          {project.name}
        </h3>
        {project.description && (
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">
            {project.description}
          </p>
        )}
      </button>

      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {modalities.length > 0 ? (
          modalities.map(([modality, count]) => (
            <Badge key={modality} tone="neutral">
              {count} {modality}
              {count > 1 ? 's' : ''}
            </Badge>
          ))
        ) : (
          <Badge tone="neutral">No sources yet</Badge>
        )}
      </div>

      <div className="mt-auto flex items-center gap-3 border-t border-line pt-3 text-[11px] text-ink-faint">
        {stats.processing > 0 && (
          <Badge tone="brand">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            {stats.processing} processing
          </Badge>
        )}
        {stats.duration_sec > 0 && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(stats.duration_sec)}
          </span>
        )}
        {stats.generated > 0 && <span>{stats.generated} generated</span>}
        <span className="ml-auto">{relativeTime(project.updated_at)}</span>
      </div>
    </Card>
  );
}
