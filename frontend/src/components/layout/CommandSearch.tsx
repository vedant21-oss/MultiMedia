import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, Loader2, Search, Sparkles } from 'lucide-react';
import { chatApi, projectApi, studioApi } from '@/services/endpoints';
import { useProjectContext } from '@/hooks/useProjectContext';
import { Badge } from '@/components/ui';
import { locatorLabel, titleCase } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * ⌘K palette. Runs semantic search across the active project's segments and a
 * plain title match over the library, so one box reaches both.
 */
export function CommandSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { activeProjectId } = useProjectContext();

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else setQuery('');
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 280);
    return () => clearTimeout(t);
  }, [query]);

  const enabled = open && debounced.length >= 2;

  const semantic = useQuery({
    queryKey: ['command-search', activeProjectId, debounced],
    queryFn: () => chatApi.search({ project_id: activeProjectId!, query: debounced, limit: 6 }),
    enabled: enabled && !!activeProjectId,
  });

  const library = useQuery({
    queryKey: ['command-library', debounced],
    queryFn: () => studioApi.library({ q: debounced, limit: 6 } as never),
    enabled,
  });

  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: projectApi.list,
    enabled: open,
  });

  if (!open) return null;

  const matchedProjects = (projects.data ?? []).filter((p) =>
    p.name.toLowerCase().includes(debounced.toLowerCase()),
  ).slice(0, 4);

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const loading = semantic.isFetching || library.isFetching;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 p-4 pt-[12vh] backdrop-blur-sm" onClick={onClose}>
      <div
        className="card w-full max-w-2xl animate-fade-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Search"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transcripts, documents, images and generated content…"
            className="h-14 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
          <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">
            esc
          </kbd>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {debounced.length < 2 && (
            <p className="px-3 py-8 text-center text-sm text-ink-faint">
              Type at least two characters. Search reaches inside video transcripts, PDF pages and
              image OCR.
            </p>
          )}

          {enabled && matchedProjects.length > 0 && (
            <Section title="Projects">
              {matchedProjects.map((p) => (
                <Row key={p.id} onClick={() => go(`/app/projects/${p.id}`)} icon={Sparkles}>
                  <span className="truncate font-medium text-ink">{p.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-ink-faint">
                    {p.stats.assets} sources
                  </span>
                </Row>
              ))}
            </Section>
          )}

          {enabled && (semantic.data?.results.length ?? 0) > 0 && (
            <Section
              title={`In your sources · ${semantic.data!.mode} search`}
              badge={semantic.data!.mode === 'lexical' ? 'keyword only' : undefined}
            >
              {semantic.data!.results.map((r) => (
                <Row
                  key={r.segment_id}
                  onClick={() => go(`/app/media/${r.asset_id}`)}
                  icon={FileText}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-ink">{r.asset_name}</span>
                      <Badge tone="neutral">{r.modality}</Badge>
                      {locatorLabel(r) && (
                        <span className="font-mono text-[10px] text-ink-faint">{locatorLabel(r)}</span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-ink-muted">{r.quote}</p>
                  </div>
                </Row>
              ))}
            </Section>
          )}

          {enabled && (library.data?.content?.length ?? 0) > 0 && (
            <Section title="Generated content">
              {library.data.content.slice(0, 5).map((c: { id: string; title: string; content_type: string; project_id: string }) => (
                <Row key={c.id} onClick={() => go(`/app/library?open=${c.id}`)} icon={Sparkles}>
                  <span className="truncate text-[13px] text-ink">{c.title}</span>
                  <Badge tone="brand" className="ml-auto shrink-0">
                    {titleCase(c.content_type)}
                  </Badge>
                </Row>
              ))}
            </Section>
          )}

          {enabled &&
            !loading &&
            !matchedProjects.length &&
            !semantic.data?.results.length &&
            !library.data?.content?.length && (
              <p className="px-3 py-8 text-center text-sm text-ink-faint">
                Nothing matched “{debounced}”.
                {!activeProjectId && ' Open a project first to search inside its media.'}
              </p>
            )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">{title}</p>
        {badge && <Badge tone="warning">{badge}</Badge>}
      </div>
      {children}
    </div>
  );
}

function Row({
  children, onClick, icon: Icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-2',
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-ink-faint" />
      {children}
    </button>
  );
}
