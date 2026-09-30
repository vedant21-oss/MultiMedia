import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, FileText, Film, Image as ImageIcon, Mic, Presentation, RefreshCw, Trash2,
  Type, Upload, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBytes, formatDuration, locatorLabel, relativeTime } from '@/lib/format';
import { Badge, Button, Progress } from '@/components/ui';
import { mediaUrl } from '@/services/api';
import { useCapabilities } from '@/hooks/useCapabilities';
import type { Asset, Citation, Project } from '@/types';

/* --------------------------- Modality helpers --------------------------- */

export const MODALITY_ICON: Record<string, LucideIcon> = {
  video: Film,
  audio: Mic,
  image: ImageIcon,
  document: FileText,
  presentation: Presentation,
  text: Type,
  subtitle: Type,
  other: FileText,
};

export const MODALITY_TONE: Record<string, string> = {
  video: 'border-violet-400/30 bg-violet-400/10 text-violet-300',
  audio: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  image: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  document: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  presentation: 'border-orange-400/30 bg-orange-400/10 text-orange-300',
  text: 'border-slate-400/30 bg-slate-400/10 text-slate-300',
  subtitle: 'border-slate-400/30 bg-slate-400/10 text-slate-300',
  other: 'border-slate-400/30 bg-slate-400/10 text-slate-300',
};

export function ModalityIcon({ modality, className }: { modality: string; className?: string }) {
  const Icon = MODALITY_ICON[modality] ?? FileText;
  return <Icon className={className ?? 'h-4 w-4'} />;
}

const STATUS_TONE: Record<string, { label: string; tone: 'neutral' | 'brand' | 'success' | 'danger'; busy?: boolean }> = {
  uploaded: { label: 'Uploaded', tone: 'neutral' },
  processing: { label: 'Processing', tone: 'brand', busy: true },
  ready: { label: 'Ready', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
};

export function StatusBadge({ status, message }: { status: string; message?: string }) {
  const meta = STATUS_TONE[status] ?? STATUS_TONE.uploaded;
  return (
    <Badge tone={meta.tone} title={message || meta.label}>
      {meta.busy && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {meta.label}
    </Badge>
  );
}

/* ------------------------------- Uploader ------------------------------- */

const ACCEPT =
  '.mp4,.mov,.webm,.mkv,.avi,.mp3,.wav,.m4a,.aac,.ogg,.flac,' +
  '.jpg,.jpeg,.png,.webp,.gif,.bmp,.heic,.pdf,.docx,.pptx,.txt,.md,.csv,.json,.srt,.vtt';

export function Uploader({
  onFiles, uploading, progress, maxMb: maxMbProp, compact,
}: {
  onFiles: (files: File[]) => void;
  uploading?: boolean;
  progress?: number;
  maxMb?: number;
  compact?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  // The real ceiling differs per deployment (Vercel caps request bodies), so
  // ask the server rather than promising a size it will reject.
  const { data: caps } = useCapabilities();
  const maxMb = maxMbProp ?? caps?.limits?.max_upload_mb ?? 500;

  const handle = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const all = Array.from(list);
      const tooBig = all.filter((f) => f.size > maxMb * 1024 * 1024);
      const ok = all.filter((f) => f.size <= maxMb * 1024 * 1024).slice(0, 10);
      setRejected(tooBig.map((f) => `${f.name} is over ${maxMb} MB`));
      if (ok.length) onFiles(ok);
    },
    [onFiles, maxMb],
  );

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!uploading) handle(e.dataTransfer.files);
        }}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !uploading) inputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
        aria-label="Upload files"
        className={cn(
          'cursor-pointer rounded-xl border-2 border-dashed text-center transition-all',
          compact ? 'px-4 py-6' : 'px-6 py-10',
          dragging ? 'border-brand bg-brand/[0.07]' : 'border-line hover:border-brand/50 hover:bg-surface-1',
          uploading && 'pointer-events-none opacity-60',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            handle(e.target.files);
            e.target.value = '';
          }}
        />

        <div
          className={cn(
            'mx-auto mb-3 grid place-items-center rounded-xl bg-brand/12 text-brand',
            compact ? 'h-9 w-9' : 'h-12 w-12',
          )}
        >
          <Upload className={compact ? 'h-4 w-4' : 'h-6 w-6'} />
        </div>

        <p className={cn('font-semibold text-ink', compact ? 'text-sm' : 'text-base')}>
          {uploading ? 'Uploading…' : 'Drop files here, or click to browse'}
        </p>
        <p className="mx-auto mt-1.5 max-w-lg text-xs leading-relaxed text-ink-muted">
          Video · audio · images · PDF · DOCX · PPTX · text · subtitles. Up to 10 files,{' '}
          {maxMb} MB each.
        </p>

        {uploading && progress != null && (
          <Progress value={progress} className="mx-auto mt-4 max-w-xs" />
        )}
      </div>

      {rejected.length > 0 && (
        <div className="mt-2 space-y-1">
          {rejected.map((r) => (
            <p key={r} className="flex items-center gap-1.5 text-xs text-danger">
              <AlertTriangle className="h-3 w-3" /> {r}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Asset card ------------------------------ */

export function AssetCard({
  asset, onDelete, onReprocess, busy, to,
}: {
  asset: Asset;
  onDelete?: (asset: Asset) => void;
  onReprocess?: (asset: Asset) => void;
  busy?: boolean;
  to?: string;
}) {
  const failed = asset.status === 'failed';
  const processing = asset.status === 'processing';
  const href = to ?? `/app/media/${asset.id}`;

  return (
    <div className="card flex flex-col overflow-hidden transition-colors hover:border-brand/35">
      <Link to={href} className="block">
        <div className="relative aspect-video overflow-hidden bg-surface-2">
          {asset.thumbnail_key ? (
            <img
              src={mediaUrl(asset.id, 'thumbnail')}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : asset.modality === 'image' ? (
            <img
              src={mediaUrl(asset.id, 'file')}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full place-items-center text-ink-faint">
              <ModalityIcon modality={asset.modality} className="h-8 w-8" />
            </div>
          )}

          {asset.duration_sec != null && (
            <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
              {formatDuration(asset.duration_sec)}
            </span>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-start gap-2">
          <Badge className={MODALITY_TONE[asset.modality]}>
            <ModalityIcon modality={asset.modality} className="h-3 w-3" />
            {asset.modality}
          </Badge>
          <StatusBadge status={asset.status} message={asset.status_message} />
        </div>

        <Link to={href} className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink hover:text-brand" title={asset.original_filename}>
            {asset.title || asset.original_filename}
          </h3>
        </Link>

        {asset.summary ? (
          <p className="line-clamp-2 text-[12px] leading-relaxed text-ink-muted">{asset.summary}</p>
        ) : processing ? (
          <div className="space-y-1.5">
            <p className="text-[12px] italic text-ink-muted">{asset.status_message}</p>
            <Progress value={asset.progress} />
          </div>
        ) : null}

        {failed && (
          <div className="flex gap-2 rounded-lg border border-danger/30 bg-danger/[0.07] px-2.5 py-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
            <p className="text-[11px] leading-relaxed text-danger">{asset.error || 'Processing failed'}</p>
          </div>
        )}

        <div className="mt-auto flex items-center gap-2 border-t border-line pt-2.5 text-[11px] text-ink-faint">
          <span>{formatBytes(asset.size_bytes)}</span>
          {asset.status === 'ready' && <span>· {asset.segment_count} segments</span>}
          <span className="ml-auto">{relativeTime(asset.created_at)}</span>

          {onReprocess && (
            <button
              onClick={() => onReprocess(asset)}
              disabled={busy}
              className="rounded p-1 text-ink-faint hover:bg-surface-2 hover:text-brand disabled:opacity-40"
              title="Re-run analysis"
              aria-label="Re-run analysis"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(asset)}
              disabled={busy}
              className="rounded p-1 text-ink-faint hover:bg-danger/10 hover:text-danger disabled:opacity-40"
              title="Delete"
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Citations ------------------------------- */

export function CitationCard({
  citation, onJump, highlighted,
}: {
  citation: Citation;
  onJump?: (c: Citation) => void;
  highlighted?: boolean;
}) {
  const where = citation.locator_label || locatorLabel(citation);
  return (
    <div
      id={`citation-${citation.segment_id}`}
      className={cn(
        'card flex gap-3 p-3 transition-all',
        highlighted && 'border-brand/60 ring-1 ring-brand/30',
      )}
    >
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-brand/40 bg-brand/12 font-mono text-[10px] font-bold text-brand">
        {citation.marker}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge className={MODALITY_TONE[citation.modality] ?? MODALITY_TONE.other}>
            <ModalityIcon modality={citation.modality} className="h-3 w-3" />
            {citation.modality}
          </Badge>
          {citation.asset_id ? (
            <Link
              to={`/app/media/${citation.asset_id}`}
              className="truncate text-xs font-medium text-ink-muted underline-offset-2 hover:text-brand hover:underline"
            >
              {citation.asset_name}
            </Link>
          ) : (
            <span className="truncate text-xs text-ink-muted">{citation.asset_name}</span>
          )}
          {where && (
            <button
              onClick={() => onJump?.(citation)}
              disabled={!onJump}
              className={cn(
                'font-mono text-[10px]',
                onJump ? 'text-brand hover:underline' : 'cursor-default text-ink-faint',
              )}
            >
              {where}
            </button>
          )}
          <span className="ml-auto font-mono text-[10px] text-ink-faint">
            {(citation.relevance * 100).toFixed(0)}%
          </span>
        </div>
        <p className="text-[12px] leading-relaxed text-ink-muted">{citation.quote}</p>
      </div>
    </div>
  );
}

/* --------------------------- Project selector --------------------------- */

export function ProjectSelector({
  projects, value, onChange, className,
}: {
  projects: Project[];
  value: string | null;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className={cn('input h-9 w-auto cursor-pointer py-0 pr-8 text-sm', className)}
      aria-label="Active project"
    >
      {projects.length === 0 && <option value="">No projects yet</option>}
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} ({p.stats.ready}/{p.stats.assets} ready)
        </option>
      ))}
    </select>
  );
}

/* ------------------------------ Rich text ------------------------------- */

const TOKEN = /(\[\[\d+(?:\s*,\s*\d+)*\]\]|\*\*[^*]+\*\*|`[^`]+`)/g;

/**
 * Minimal markdown renderer for model output: paragraphs, lists, bold, code,
 * and CreatorAI's [[n]] inline citations. Deliberately dependency-free.
 */
export function RichText({
  text, onCitation, className,
}: {
  text: string;
  onCitation?: (marker: number) => void;
  className?: string;
}) {
  if (!text) return null;

  return (
    <div className={cn('space-y-3', className)}>
      {text.split(/\n{2,}/).map((block, bi) => {
        const lines = block.split('\n').filter((l) => l.trim());
        const bulleted = lines.length > 0 && lines.every((l) => /^\s*[-*•]\s+/.test(l));
        const numbered = lines.length > 0 && lines.every((l) => /^\s*\d+[.)]\s+/.test(l));

        if (bulleted || numbered) {
          const Tag = numbered ? 'ol' : 'ul';
          return (
            <Tag
              key={bi}
              className={cn(
                'space-y-1.5 pl-5 text-sm leading-relaxed text-ink-muted marker:text-ink-faint',
                numbered ? 'list-decimal' : 'list-disc',
              )}
            >
              {lines.map((line, li) => (
                <li key={li}>
                  <Inline text={line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')} onCitation={onCitation} />
                </li>
              ))}
            </Tag>
          );
        }

        if (/^#{1,4}\s/.test(block)) {
          return (
            <h4 key={bi} className="text-sm font-bold text-ink">
              <Inline text={block.replace(/^#{1,4}\s/, '')} onCitation={onCitation} />
            </h4>
          );
        }

        if (/^>\s/.test(block)) {
          return (
            <blockquote key={bi} className="border-l-2 border-line pl-3 text-[13px] italic text-ink-faint">
              <Inline text={block.replace(/^>\s?/gm, '')} onCitation={onCitation} />
            </blockquote>
          );
        }

        return (
          <p key={bi} className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
            <Inline text={block} onCitation={onCitation} />
          </p>
        );
      })}
    </div>
  );
}

function Inline({ text, onCitation }: { text: string; onCitation?: (n: number) => void }) {
  return (
    <>
      {text.split(TOKEN).filter(Boolean).map((part, i) => {
        // Models sometimes group citations: [[1, 4, 5]] renders as three chips.
        const cite = part.match(/^\[\[(\d+(?:\s*,\s*\d+)*)\]\]$/);
        if (cite) {
          return cite[1].split(',').map((n) => Number(n.trim())).map((marker) => (
            <button
              key={`${i}-${marker}`}
              onClick={() => onCitation?.(marker)}
              className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded border border-brand/40 bg-brand/12 px-1 align-super font-mono text-[9px] font-bold text-brand hover:bg-brand/25"
              title="Jump to the source"
            >
              {marker}
            </button>
          ));
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold text-ink">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-accent">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/* ----------------------------- Page header ------------------------------ */

export function PageHeader({
  title, subtitle, actions, children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** Explains, in place, that a feature needs configuration instead of failing silently. */
export function CapabilityNote({
  needs, mode, hint,
}: { needs?: string | null; mode?: string; hint?: string }) {
  if (!needs) return null;
  const isKey = needs.includes('KEY');
  return (
    <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning/[0.07] px-3.5 py-2.5">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <p className="text-[13px] leading-relaxed text-ink-muted">
        {mode && (
          <span className="font-semibold text-warning">Currently {mode}. </span>
        )}
        Needs <code className="rounded bg-surface-2 px-1 font-mono text-[11px] text-warning">{needs}</code>
        {hint ? ` — ${hint}` : '.'}{' '}
        {isKey && (
          <Link to="/app/settings" className="font-semibold text-warning hover:underline">
            Set it up
          </Link>
        )}
      </p>
    </div>
  );
}

export function ExportButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick}>
      {label}
    </Button>
  );
}
