import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, History, Library, RotateCcw, Search, Star, Trash2 } from 'lucide-react';
import { generateApi, studioApi } from '@/services/endpoints';
import { api, errorMessage } from '@/services/api';
import { useProjectContext } from '@/hooks/useProjectContext';
import {
  Badge, Button, Card, ConfirmDialog, CopyButton, DemoBadge, Dialog, EmptyState,
  Skeleton, Tabs,
} from '@/components/ui';
import { ModalityIcon, MODALITY_TONE, PageHeader, RichText } from '@/components/shared';
import { relativeTime, titleCase } from '@/lib/format';

type TabId = 'all' | 'assets' | 'content';

interface LibraryAsset {
  id: string; kind: string; project_id: string; title: string; subtitle: string;
  modality: string; status: string; is_favorite: boolean; created_at: string; tags: string;
}
interface LibraryContent {
  id: string; kind: string; project_id: string; title: string; subtitle: string;
  content_type: string; platform: string; status: string; is_favorite: boolean;
  generation_source: string; created_at: string; tags: string;
}

export default function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<TabId>('all');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [scopeProject, setScopeProject] = useState(true);
  const [openId, setOpenId] = useState<string | null>(params.get('open'));
  const [pendingDelete, setPendingDelete] = useState<LibraryContent | null>(null);
  const { projects, activeProjectId } = useProjectContext();
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const library = useQuery({
    queryKey: ['library', debounced, tab, favoritesOnly, scopeProject ? activeProjectId : null],
    queryFn: () =>
      studioApi.library({
        q: debounced || undefined,
        kind: tab,
        favorites_only: favoritesOnly,
        project_id: scopeProject ? (activeProjectId ?? undefined) : undefined,
      }),
  });

  const removeContent = useMutation({
    mutationFn: (id: string) => generateApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library'] });
      setPendingDelete(null);
      toast.success('Deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const toggleFavorite = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      generateApi.update(id, { is_favorite: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library'] }),
  });

  const assets: LibraryAsset[] = library.data?.assets ?? [];
  const content: LibraryContent[] = library.data?.content ?? [];
  const empty = !library.isLoading && assets.length === 0 && content.length === 0;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Content Library"
        subtitle="Everything you have uploaded and everything you have generated, searchable together."
      />

      <Card className="mb-5 flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, summaries and generated text…"
            className="input pl-9"
          />
        </div>

        <button
          onClick={() => setFavoritesOnly((v) => !v)}
          className={`chip ${favoritesOnly ? 'border-warning/50 bg-warning/12 text-warning' : 'border-line bg-surface-2 text-ink-muted'}`}
        >
          <Star className={`h-3 w-3 ${favoritesOnly ? 'fill-current' : ''}`} />
          Favourites
        </button>

        {projects.length > 1 && (
          <button
            onClick={() => setScopeProject((v) => !v)}
            className={`chip ${scopeProject ? 'border-brand/50 bg-brand/12 text-brand' : 'border-line bg-surface-2 text-ink-muted'}`}
          >
            {scopeProject ? 'This project' : 'All projects'}
          </button>
        )}
      </Card>

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'all', label: 'Everything', count: assets.length + content.length },
          { id: 'assets', label: 'Uploads', count: assets.length },
          { id: 'content', label: 'Generated', count: content.length },
        ]}
      />

      {library.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : empty ? (
        <EmptyState
          icon={Library}
          title={debounced ? `Nothing matched “${debounced}”` : 'Your library is empty'}
          description={
            debounced
              ? 'Try a different search, or widen the scope to all projects.'
              : 'Upload media or generate content and it will appear here.'
          }
        />
      ) : (
        <div className="space-y-6">
          {(tab === 'all' || tab === 'assets') && assets.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-faint">
                Uploads ({assets.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {assets.map((a) => (
                  <Link
                    key={a.id}
                    to={`/app/media/${a.id}`}
                    className="card flex gap-3 p-3.5 transition-colors hover:border-brand/40"
                  >
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${MODALITY_TONE[a.modality]}`}>
                      <ModalityIcon modality={a.modality} className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[13px] font-semibold text-ink">{a.title}</h3>
                      <p className="line-clamp-2 text-[11px] leading-relaxed text-ink-muted">{a.subtitle}</p>
                      <p className="mt-1 text-[10px] text-ink-faint">{relativeTime(a.created_at)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {(tab === 'all' || tab === 'content') && content.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-faint">
                Generated ({content.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {content.map((c) => (
                  <Card key={c.id} className="group flex flex-col p-3.5 transition-colors hover:border-brand/40">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone="brand">{titleCase(c.content_type)}</Badge>
                      {c.platform !== 'none' && <Badge tone="accent">{c.platform}</Badge>}
                      <DemoBadge source={c.generation_source} />
                      <button
                        onClick={() => toggleFavorite.mutate({ id: c.id, value: !c.is_favorite })}
                        className="ml-auto rounded p-1 text-ink-faint hover:text-warning"
                        aria-label="Toggle favourite"
                      >
                        <Star className={`h-3.5 w-3.5 ${c.is_favorite ? 'fill-warning text-warning' : ''}`} />
                      </button>
                    </div>

                    <button onClick={() => setOpenId(c.id)} className="flex-1 text-left">
                      <h3 className="line-clamp-2 text-[13px] font-semibold text-ink">{c.title}</h3>
                      <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-ink-muted">
                        {c.subtitle}
                      </p>
                    </button>

                    <div className="mt-2.5 flex items-center gap-1 border-t border-line pt-2 text-[10px] text-ink-faint">
                      <span>{relativeTime(c.created_at)}</span>
                      <button
                        onClick={() => setPendingDelete(c)}
                        className="ml-auto rounded p-1 opacity-0 hover:text-danger group-hover:opacity-100"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {openId && (
        <ContentDialog
          contentId={openId}
          onClose={() => {
            setOpenId(null);
            params.delete('open');
            setParams(params, { replace: true });
          }}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && removeContent.mutate(pendingDelete.id)}
        title="Delete this content?"
        body="The draft and all of its saved versions are removed permanently."
        loading={removeContent.isPending}
      />
    </div>
  );
}

function ContentDialog({ contentId, onClose }: { contentId: string; onClose: () => void }) {
  const [showVersions, setShowVersions] = useState(false);
  const queryClient = useQueryClient();

  const content = useQuery({
    queryKey: ['content', contentId],
    queryFn: () => generateApi.get(contentId),
  });

  const versions = useQuery({
    queryKey: ['versions', contentId],
    queryFn: () => generateApi.versions(contentId) as Promise<
      { id: string; version: number; title: string; body: string; edited_by_user: boolean; note: string; created_at: string }[]
    >,
    enabled: showVersions,
  });

  const restore = useMutation({
    mutationFn: (version: number) => generateApi.restore(contentId, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content', contentId] });
      queryClient.invalidateQueries({ queryKey: ['versions', contentId] });
      toast.success('Version restored');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const download = async (fmt: 'md' | 'txt') => {
    const response = await api.get(generateApi.exportUrl(contentId, fmt), { responseType: 'blob' });
    const url = URL.createObjectURL(response.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(content.data?.title ?? 'content').slice(0, 40).replace(/\s+/g, '-').toLowerCase()}.${fmt}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={content.data?.title || 'Content'}
      description={content.data ? `${titleCase(content.data.content_type)} · ${content.data.tone}` : undefined}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => setShowVersions((v) => !v)}>
            <History className="h-3.5 w-3.5" />
            {content.data?.version_count ?? 0} versions
          </Button>
          <Button variant="secondary" size="sm" onClick={() => download('md')}>
            <Download className="h-3.5 w-3.5" /> .md
          </Button>
          <Button variant="secondary" size="sm" onClick={() => download('txt')}>
            <Download className="h-3.5 w-3.5" /> .txt
          </Button>
          {content.data && <CopyButton text={`${content.data.title}\n\n${content.data.body}`} />}
        </>
      }
    >
      {content.isLoading ? (
        <Skeleton className="h-40" />
      ) : content.data ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="brand">{titleCase(content.data.content_type)}</Badge>
            {content.data.platform !== 'none' && <Badge tone="accent">{content.data.platform}</Badge>}
            <DemoBadge source={content.data.generation_source} />
            <Badge tone="neutral">{content.data.language}</Badge>
          </div>

          <RichText text={content.data.body} />

          {content.data.citations.length > 0 && (
            <div className="border-t border-line pt-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                Sources
              </p>
              <ul className="space-y-1.5">
                {content.data.citations.map((c, i) => (
                  <li key={i} className="text-[12px] text-ink-muted">
                    <span className="font-mono text-[10px] text-brand">[{i + 1}]</span>{' '}
                    {c.quote.slice(0, 160)}…
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showVersions && (
            <div className="border-t border-line pt-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                Version history
              </p>
              {versions.isLoading ? (
                <Skeleton className="h-20" />
              ) : (
                <div className="space-y-2">
                  {(versions.data ?? []).map((v) => (
                    <div key={v.id} className="flex items-start gap-3 rounded-lg border border-line p-2.5">
                      <Badge tone="neutral">v{v.version}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] text-ink">{v.note}</p>
                        <p className="truncate text-[11px] text-ink-faint">{v.body.slice(0, 90)}</p>
                        <p className="mt-0.5 text-[10px] text-ink-faint">{relativeTime(v.created_at)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => restore.mutate(v.version)}
                        loading={restore.isPending}
                      >
                        <RotateCcw className="h-3 w-3" /> Restore
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
