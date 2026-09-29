import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sparkles, Upload as UploadIcon } from 'lucide-react';
import { generateApi, mediaApi } from '@/services/endpoints';
import { errorMessage } from '@/services/api';
import { useProjectContext } from '@/hooks/useProjectContext';
import { useCapabilities } from '@/hooks/useCapabilities';
import {
  Badge, Button, Card, DemoBadge, EmptyState, Select, Skeleton, Spinner,
} from '@/components/ui';
import { AssetCard, CapabilityNote, PageHeader, ProjectSelector, RichText, Uploader } from '@/components/shared';
import { titleCase } from '@/lib/format';
import type { GeneratedContent, Modality } from '@/types';

/**
 * Shared implementation behind the Audio, Image and Document studios.
 * Each one is the same workflow — filter the project to a modality, upload more,
 * and run the content types that make sense for it — so it lives in one place.
 */
export function ModalityStudio({
  title, subtitle, modalities, contentTypes, emptyHint, capabilityKey,
}: {
  title: string;
  subtitle: string;
  modalities: Modality[];
  contentTypes: string[];
  emptyHint: string;
  capabilityKey?: string;
}) {
  const { projects, activeProjectId, setActiveProjectId } = useProjectContext();
  const { data: caps } = useCapabilities();
  const [selected, setSelected] = useState<string[]>([]);
  const [contentType, setContentType] = useState(contentTypes[0]);
  const [results, setResults] = useState<GeneratedContent[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const queryClient = useQueryClient();

  const assets = useQuery({
    queryKey: ['media', activeProjectId],
    queryFn: () => mediaApi.list(activeProjectId!),
    enabled: !!activeProjectId,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((a) => a.status === 'processing') ? 2500 : false,
  });

  const filtered = useMemo(
    () => (assets.data ?? []).filter((a) => modalities.includes(a.modality)),
    [assets.data, modalities],
  );
  const ready = filtered.filter((a) => a.status === 'ready');

  const upload = useMutation({
    mutationFn: (files: File[]) => mediaApi.upload(activeProjectId!, files, setProgress),
    onMutate: () => {
      setUploading(true);
      setProgress(0);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['media', activeProjectId] });
      toast.success(`${data.assets.length} file(s) queued`);
      data.skipped?.forEach((s) => toast.warning(`${s.filename}: ${s.reason}`));
    },
    onError: (err) => toast.error(errorMessage(err, 'Upload failed')),
    onSettled: () => {
      setUploading(false);
      setProgress(0);
    },
  });

  const generate = useMutation({
    mutationFn: () =>
      generateApi.run({
        project_id: activeProjectId,
        content_type: contentType,
        asset_ids: selected.length ? selected : ready.map((a) => a.id),
        variations: 2,
        tone: 'educational',
      }),
    onSuccess: (data) => {
      setResults(data.items);
      toast.success(`Generated ${data.items.length} variation(s)`);
    },
    onError: (err) => toast.error(errorMessage(err, 'Generation failed')),
  });

  const capability = capabilityKey ? caps?.features?.[capabilityKey] : undefined;

  if (!projects.length) {
    return (
      <EmptyState
        icon={UploadIcon}
        title="Create a project first"
        description="Studios work on the media inside a project."
        action={<Link to="/app"><Button>Go to dashboard</Button></Link>}
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <ProjectSelector projects={projects} value={activeProjectId} onChange={setActiveProjectId} />
        }
      />

      {capability && !capability.available && (
        <div className="mb-5">
          <CapabilityNote needs={capability.needs} mode={capability.mode} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Uploader onFiles={(f) => upload.mutate(f)} uploading={uploading} progress={progress} compact />

          {assets.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1].map((i) => <Skeleton key={i} className="h-64" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={UploadIcon} title="Nothing here yet" description={emptyHint} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.map((asset) => (
                <div key={asset.id} className="relative">
                  {asset.status === 'ready' && (
                    <button
                      onClick={() =>
                        setSelected((prev) =>
                          prev.includes(asset.id)
                            ? prev.filter((id) => id !== asset.id)
                            : [...prev, asset.id],
                        )
                      }
                      className={`absolute right-3 top-3 z-10 rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${
                        selected.includes(asset.id)
                          ? 'border-brand bg-brand text-brand-ink'
                          : 'border-line bg-surface-1/90 text-ink-muted hover:text-ink'
                      }`}
                    >
                      {selected.includes(asset.id) ? 'Selected' : 'Select'}
                    </button>
                  )}
                  <AssetCard asset={asset} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-faint">
              Turn this into…
            </h2>

            <Select
              id="studio-type"
              label="Content type"
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
            >
              {contentTypes.map((t) => (
                <option key={t} value={t}>{titleCase(t)}</option>
              ))}
            </Select>

            <p className="mt-2 text-[11px] text-ink-faint">
              {selected.length
                ? `Using ${selected.length} selected source${selected.length === 1 ? '' : 's'}.`
                : `Using all ${ready.length} processed source${ready.length === 1 ? '' : 's'} here.`}
            </p>

            <Button
              className="mt-3 w-full"
              onClick={() => generate.mutate()}
              loading={generate.isPending}
              disabled={ready.length === 0}
            >
              <Sparkles className="h-4 w-4" /> Generate
            </Button>

            <Link to="/app/create" className="mt-2 block text-center text-[11px] text-ink-faint hover:text-brand">
              More options in Create Content →
            </Link>
          </Card>

          {generate.isPending && (
            <Card className="p-5">
              <Spinner label="Writing from your sources…" />
            </Card>
          )}

          {results.map((item) => (
            <Card key={item.id} className="animate-fade-up p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone="brand">{titleCase(item.content_type)}</Badge>
                <DemoBadge source={item.generation_source} />
              </div>
              {item.title && <h3 className="mb-1.5 text-sm font-semibold text-ink">{item.title}</h3>}
              <RichText text={item.body} />
              {item.citations.length > 0 && (
                <p className="mt-3 border-t border-line pt-2 text-[11px] text-ink-faint">
                  Drawn from {item.citations.length} source segment
                  {item.citations.length === 1 ? '' : 's'}
                </p>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
