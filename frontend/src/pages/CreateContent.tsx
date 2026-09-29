import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Download, FileStack, Pencil, RefreshCw, Save, Sparkles, X } from 'lucide-react';
import { generateApi, mediaApi, studioApi } from '@/services/endpoints';
import { api, errorMessage } from '@/services/api';
import { useProjectContext } from '@/hooks/useProjectContext';
import {
  Badge, Button, Card, DemoBadge, EmptyState, Input, Select, Skeleton, Spinner, Textarea,
} from '@/components/ui';
import { CopyButton } from '@/components/ui';
import {
  CitationCard, ModalityIcon, MODALITY_TONE, PageHeader, ProjectSelector, RichText,
} from '@/components/shared';
import { titleCase } from '@/lib/format';
import type { GeneratedContent } from '@/types';

const DEFAULTS = {
  content_type: 'instagram_post',
  platform: 'instagram',
  tone: 'friendly',
  language: 'English',
  audience: '',
  length: 'medium',
  variations: 3,
  extra_instructions: '',
};

/** Sensible platform for a content type, so the two selects stay coherent. */
const TYPE_PLATFORM: Record<string, string> = {
  instagram_post: 'instagram', tiktok_caption: 'tiktok', linkedin_post: 'linkedin',
  x_post: 'x', facebook_post: 'facebook', youtube_title: 'youtube',
  youtube_description: 'youtube', video_script: 'youtube', short_script: 'tiktok',
  blog_article: 'blog', newsletter: 'newsletter', show_notes: 'blog',
};

export default function CreateContent() {
  const { projects, activeProjectId, setActiveProjectId } = useProjectContext();
  const [form, setForm] = useState(DEFAULTS);
  const [selected, setSelected] = useState<string[]>([]);
  const [brandId, setBrandId] = useState('');
  const [results, setResults] = useState<GeneratedContent[]>([]);
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();

  const options = useQuery({ queryKey: ['generate-options'], queryFn: generateApi.options });
  const brands = useQuery({ queryKey: ['brands'], queryFn: studioApi.brands });

  const assets = useQuery({
    queryKey: ['media', activeProjectId],
    queryFn: () => mediaApi.list(activeProjectId!),
    enabled: !!activeProjectId,
  });

  const ready = useMemo(
    () => (assets.data ?? []).filter((a) => a.status === 'ready'),
    [assets.data],
  );

  // Selecting a new project clears a stale source selection.
  useEffect(() => setSelected([]), [activeProjectId]);

  const generate = useMutation({
    mutationFn: () =>
      generateApi.run({
        project_id: activeProjectId,
        ...form,
        asset_ids: selected,
        brand_profile_id: brandId || null,
      }),
    onSuccess: (data) => {
      setResults(data.items);
      setNote(data.sources_note);
      queryClient.invalidateQueries({ queryKey: ['content', activeProjectId] });
      toast.success(
        `${data.items.length} variation${data.items.length === 1 ? '' : 's'} generated${
          data.mode === 'demo' ? ' (demo mode)' : ''
        }`,
      );
    },
    onError: (err) => toast.error(errorMessage(err, 'Generation failed')),
  });

  if (!projects.length) {
    return (
      <EmptyState
        icon={FileStack}
        title="Create a project first"
        description="Content is generated from the media inside a project."
        action={
          <Link to="/app">
            <Button>Go to dashboard</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Create content"
        subtitle="Pick your sources and the AI writes from them — never from thin air."
        actions={
          <ProjectSelector
            projects={projects}
            value={activeProjectId}
            onChange={setActiveProjectId}
          />
        }
      />

      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* ---------------- Controls ---------------- */}
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-faint">
              Sources ({selected.length ? `${selected.length} selected` : 'all ready sources'})
            </h2>

            {assets.isLoading ? (
              <Skeleton className="h-24" />
            ) : ready.length === 0 ? (
              <p className="text-[13px] text-ink-muted">
                Nothing processed yet.{' '}
                <Link to={`/app/projects/${activeProjectId}`} className="font-semibold text-brand hover:underline">
                  Upload something
                </Link>
                .
              </p>
            ) : (
              <>
                <div className="max-h-60 space-y-1 overflow-y-auto">
                  {ready.map((asset) => {
                    const checked = selected.includes(asset.id);
                    return (
                      <button
                        key={asset.id}
                        onClick={() =>
                          setSelected((prev) =>
                            checked ? prev.filter((id) => id !== asset.id) : [...prev, asset.id],
                          )
                        }
                        className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                          checked ? 'border-brand/50 bg-brand/[0.08]' : 'border-line hover:bg-surface-2'
                        }`}
                      >
                        <span
                          className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                            checked ? 'border-brand bg-brand text-white' : 'border-line'
                          }`}
                        >
                          {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <Badge className={MODALITY_TONE[asset.modality]}>
                          <ModalityIcon modality={asset.modality} className="h-3 w-3" />
                        </Badge>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                          {asset.title || asset.original_filename}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                          {asset.segment_count}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {selected.length > 0 && (
                  <button
                    onClick={() => setSelected([])}
                    className="mt-2 text-[11px] font-medium text-ink-faint hover:text-brand"
                  >
                    Clear selection (use everything)
                  </button>
                )}
              </>
            )}
          </Card>

          <Card className="space-y-3.5 p-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-faint">Output</h2>

            <Select
              id="content_type"
              label="Content type"
              value={form.content_type}
              onChange={(e) => {
                const value = e.target.value;
                setForm((f) => ({
                  ...f,
                  content_type: value,
                  platform: TYPE_PLATFORM[value] ?? f.platform,
                }));
              }}
            >
              {(options.data?.content_types ?? []).map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </Select>

            <div className="grid grid-cols-2 gap-3">
              <Select
                id="platform"
                label="Platform"
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
              >
                {(options.data?.platforms ?? []).map((p) => (
                  <option key={p} value={p}>
                    {titleCase(p)}
                  </option>
                ))}
              </Select>

              <Select
                id="tone"
                label="Tone"
                value={form.tone}
                onChange={(e) => setForm({ ...form, tone: e.target.value })}
              >
                {(options.data?.tones ?? []).map((t) => (
                  <option key={t} value={t}>
                    {titleCase(t)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select
                id="length"
                label="Length"
                value={form.length}
                onChange={(e) => setForm({ ...form, length: e.target.value })}
              >
                {(options.data?.lengths ?? ['short', 'medium', 'long']).map((l) => (
                  <option key={l} value={l}>
                    {titleCase(l)}
                  </option>
                ))}
              </Select>

              <Select
                id="variations"
                label="Variations"
                value={String(form.variations)}
                onChange={(e) => setForm({ ...form, variations: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>

            <Input
              id="language"
              label="Language"
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
              placeholder="English"
            />

            <Input
              id="audience"
              label="Audience"
              value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value })}
              placeholder="Second-year CS students"
            />

            <Select
              id="brand"
              label="Brand voice"
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
            >
              <option value="">None</option>
              {(brands.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.is_default ? ' (default)' : ''}
                </option>
              ))}
            </Select>

            <Textarea
              id="extra"
              label="Extra instructions"
              value={form.extra_instructions}
              onChange={(e) => setForm({ ...form, extra_instructions: e.target.value })}
              placeholder="Anything specific — a hook to use, something to avoid, a call to action."
              className="min-h-[70px]"
            />

            <Button
              className="w-full"
              onClick={() => generate.mutate()}
              loading={generate.isPending}
              disabled={!activeProjectId || ready.length === 0}
            >
              <Sparkles className="h-4 w-4" />
              Generate
            </Button>

            {options.data?.platform_rules?.[form.platform] && (
              <p className="text-[11px] leading-relaxed text-ink-faint">
                {options.data.platform_rules[form.platform]}
              </p>
            )}
          </Card>
        </div>

        {/* ---------------- Results ---------------- */}
        <div className="space-y-4">
          {generate.isPending && (
            <Card className="p-8">
              <Spinner label="Reading your sources and writing…" />
            </Card>
          )}

          {!generate.isPending && results.length === 0 && (
            <EmptyState
              icon={Sparkles}
              title="Nothing generated yet"
              description="Choose a content type and hit Generate. Each variation cites the exact segments it drew on, so you can check every claim."
            />
          )}

          {note && (
            <div className="rounded-lg border border-warning/30 bg-warning/[0.07] px-3.5 py-2.5">
              <p className="text-[13px] leading-relaxed text-ink-muted">
                <span className="font-semibold text-warning">Note on sources: </span>
                {note}
              </p>
            </div>
          )}

          {results.map((item, index) => (
            <ResultCard key={item.id} item={item} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultCard({ item, index }: { item: GeneratedContent; index: number }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: item.title, body: item.body });
  const [current, setCurrent] = useState(item);
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: () => generateApi.update(item.id, { ...draft, note: 'Edited in Create Content' }),
    onSuccess: (updated) => {
      setCurrent(updated);
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['library'] });
      toast.success(`Saved as version ${updated.version_count}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const download = async (fmt: 'md' | 'txt') => {
    try {
      const response = await api.get(generateApi.exportUrl(item.id, fmt), { responseType: 'blob' });
      const url = URL.createObjectURL(response.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(current.title || 'content').slice(0, 50).replace(/\s+/g, '-').toLowerCase()}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(errorMessage(err, 'Export failed'));
    }
  };

  const structured = current.structured as
    | { questions?: { question: string; options: string[]; answer_index: number; explanation: string }[]; cards?: { front: string; back: string }[] }
    | null;

  return (
    <Card className="animate-fade-up overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <Badge tone="brand">Variation {index + 1}</Badge>
        <Badge tone="neutral">{titleCase(current.content_type)}</Badge>
        {current.platform !== 'none' && <Badge tone="accent">{titleCase(current.platform)}</Badge>}
        <DemoBadge source={current.generation_source} />
        {current.version_count > 1 && (
          <Badge tone="neutral">v{current.version_count}</Badge>
        )}

        <div className="ml-auto flex items-center gap-1">
          <CopyButton text={`${current.title}\n\n${current.body}`} />
          <Button variant="ghost" size="sm" onClick={() => download('md')}>
            <Download className="h-3.5 w-3.5" /> .md
          </Button>
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
              <Button size="sm" onClick={() => save.mutate()} loading={save.isPending}>
                <Save className="h-3.5 w-3.5" /> Save
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3 p-4">
        {editing ? (
          <>
            <Input
              id={`title-${item.id}`}
              label="Title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <Textarea
              id={`body-${item.id}`}
              label="Body"
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              className="min-h-[220px] font-mono text-[13px]"
            />
            <p className="text-[11px] text-ink-faint">
              Saving keeps the previous text as a version you can restore from the Library.
            </p>
          </>
        ) : (
          <>
            {current.title && (
              <h3 className="text-base font-semibold leading-snug text-ink">{current.title}</h3>
            )}
            <RichText text={current.body} />

            {structured?.questions && (
              <ol className="space-y-3">
                {structured.questions.map((q, i) => (
                  <li key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                    <p className="text-[13px] font-medium text-ink">
                      {i + 1}. {q.question}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {q.options?.map((opt, oi) => (
                        <li
                          key={oi}
                          className={`text-[12px] ${
                            oi === q.answer_index ? 'font-semibold text-success' : 'text-ink-muted'
                          }`}
                        >
                          {String.fromCharCode(65 + oi)}. {opt}
                          {oi === q.answer_index && ' ✓'}
                        </li>
                      ))}
                    </ul>
                    {q.explanation && (
                      <p className="mt-2 text-[11px] italic text-ink-faint">{q.explanation}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}

            {structured?.cards && (
              <div className="grid gap-2 sm:grid-cols-2">
                {structured.cards.map((c, i) => (
                  <div key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                    <p className="text-[13px] font-semibold text-ink">{c.front}</p>
                    <p className="mt-1 text-[12px] text-ink-muted">{c.back}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {current.citations.length > 0 && (
        <div className="border-t border-line bg-surface-2/40 p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
            Drawn from {current.citations.length} source segment
            {current.citations.length === 1 ? '' : 's'}
          </p>
          <div className="space-y-2">
            {current.citations.map((c) => (
              <CitationCard key={c.segment_id} citation={c} />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-line px-4 py-2 text-[10px] text-ink-faint">
        <RefreshCw className="h-3 w-3" />
        {current.prompt_template} v{current.prompt_version}
        {current.model_used && <span>· {current.model_used}</span>}
        {current.generation_ms > 0 && <span>· {(current.generation_ms / 1000).toFixed(1)}s</span>}
        {current.tokens_used > 0 && <span>· {current.tokens_used} tokens</span>}
      </div>
    </Card>
  );
}
