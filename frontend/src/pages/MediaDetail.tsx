import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Clock, Download, RefreshCw, Scissors, Sparkles } from 'lucide-react';
import { mediaApi, videoApi, downloadBlob } from '@/services/endpoints';
import { errorMessage, mediaUrl } from '@/services/api';
import {
  Badge, Button, Card, CopyButton, DemoBadge, EmptyState, Progress, Skeleton, Tabs,
} from '@/components/ui';
import { MODALITY_TONE, ModalityIcon, PageHeader, StatusBadge } from '@/components/shared';
import { formatBytes, formatDuration, timecode } from '@/lib/format';
import type { Segment } from '@/types';

type TabId = 'segments' | 'text' | 'details';

export default function MediaDetail() {
  const { mediaId } = useParams<{ mediaId: string }>();
  const [tab, setTab] = useState<TabId>('segments');
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const queryClient = useQueryClient();

  const asset = useQuery({
    queryKey: ['asset', mediaId],
    queryFn: () => mediaApi.get(mediaId!),
    enabled: !!mediaId,
    refetchInterval: (query) =>
      ['processing', 'uploaded'].includes(query.state.data?.status ?? '') ? 2500 : false,
  });

  useEffect(() => {
    if (asset.data?.status === 'ready') {
      queryClient.invalidateQueries({ queryKey: ['media', asset.data.project_id] });
    }
  }, [asset.data?.status, asset.data?.project_id, queryClient]);

  const reprocess = useMutation({
    mutationFn: () => mediaApi.reprocess(mediaId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset', mediaId] });
      toast.info('Re-queued for analysis');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (asset.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!asset.data) {
    return <EmptyState icon={AlertTriangle} title="Source not found" description="It may have been deleted." />;
  }

  const data = asset.data;
  const timed = data.modality === 'video' || data.modality === 'audio';
  const processing = data.status === 'processing' || data.status === 'uploaded';

  const seek = (seconds?: number | null) => {
    if (seconds == null || !mediaRef.current) return;
    mediaRef.current.currentTime = seconds;
    mediaRef.current.play?.().catch(() => {});
    mediaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const exportSubs = async (fmt: 'srt' | 'vtt') => {
    try {
      const blob = await videoApi.subtitles(mediaId!, { fmt });
      downloadBlob(blob, `${data.title.slice(0, 40) || 'subtitles'}.${fmt}`);
    } catch (err) {
      toast.error(errorMessage(err, 'No transcript available'));
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        to={`/app/projects/${data.project_id}`}
        className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-ink-faint hover:text-brand"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to project
      </Link>

      <PageHeader
        title={data.title || data.original_filename}
        subtitle={data.original_filename !== data.title ? data.original_filename : undefined}
        actions={
          <>
            <StatusBadge status={data.status} message={data.status_message} />
            {data.modality === 'video' && (
              <Link to={`/app/video/${data.id}`}>
                <Button variant="secondary" size="sm">
                  <Scissors className="h-4 w-4" /> Video Studio
                </Button>
              </Link>
            )}
            <Button variant="secondary" size="sm" onClick={() => reprocess.mutate()} loading={reprocess.isPending}>
              <RefreshCw className="h-4 w-4" /> Re-analyse
            </Button>
          </>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge className={MODALITY_TONE[data.modality]}>
            <ModalityIcon modality={data.modality} className="h-3 w-3" />
            {data.modality}
          </Badge>
          <Badge tone="neutral">{formatBytes(data.size_bytes)}</Badge>
          {data.duration_sec != null && <Badge tone="neutral">{formatDuration(data.duration_sec)}</Badge>}
          {data.width && <Badge tone="neutral">{data.width}×{data.height}</Badge>}
          {data.page_count && <Badge tone="neutral">{data.page_count} pages</Badge>}
          {data.language && <Badge tone="neutral">{data.language}</Badge>}
          <Badge tone="neutral">{data.segment_count} segments</Badge>
          <DemoBadge source={data.analysis_source} />
          {data.processing_ms > 0 && (
            <span className="text-[11px] text-ink-faint">
              analysed in {(data.processing_ms / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      </PageHeader>

      {processing && (
        <Card className="mb-5 p-4">
          <div className="mb-2 flex items-center justify-between text-[13px]">
            <span className="text-ink-muted">{data.status_message || 'Processing…'}</span>
            <span className="font-mono text-brand">{data.progress}%</span>
          </div>
          <Progress value={data.progress} />
        </Card>
      )}

      {data.status === 'failed' && (
        <Card className="mb-5 flex gap-3 border-danger/40 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div>
            <p className="text-sm font-semibold text-danger">Processing failed</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{data.error}</p>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Preview + summary */}
        <div className="space-y-4">
          <MediaPreview
            assetId={data.id}
            modality={data.modality}
            mimeType={data.mime_type}
            mediaRef={mediaRef}
          />

          {data.summary && (
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-ink-faint">Summary</h2>
                <CopyButton text={data.summary} className="ml-auto" />
              </div>
              <p className="text-sm leading-relaxed text-ink-muted">{data.summary}</p>
            </Card>
          )}

          {data.topics.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-ink-faint">Topics</h2>
              <div className="flex flex-wrap gap-1.5">
                {data.topics.map((t, i) => (
                  <Badge key={i} tone="brand">{String(t)}</Badge>
                ))}
              </div>
            </Card>
          )}

          {Array.isArray((data.extra as { key_points?: string[] })?.key_points) && (
            <Card className="p-4">
              <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-ink-faint">
                Key points
              </h2>
              <ul className="space-y-2">
                {((data.extra as { key_points: string[] }).key_points).map((p, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-ink-muted">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
                    {p}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Segments / text */}
        <div className="space-y-3">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'segments', label: `Segments (${data.segments.length})` },
              { id: 'text', label: timed ? 'Transcript' : 'Extracted text' },
              { id: 'details', label: 'Details' },
            ]}
          />

          {tab === 'segments' &&
            (data.segments.length ? (
              <div className="max-h-[36rem] space-y-2 overflow-y-auto pr-1">
                {data.segments.map((segment) => (
                  <SegmentCard key={segment.id} segment={segment} timed={timed} onSeek={seek} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={AlertTriangle}
                title="No segments yet"
                description={
                  processing
                    ? 'Still processing.'
                    : 'Nothing extractable was found. Audio and video need an AI key to be transcribed.'
                }
              />
            ))}

          {tab === 'text' && (
            <div className="space-y-2">
              {timed && data.segments.some((s) => s.kind === 'transcript') && (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => exportSubs('srt')}>
                    <Download className="h-3.5 w-3.5" /> .srt
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => exportSubs('vtt')}>
                    <Download className="h-3.5 w-3.5" /> .vtt
                  </Button>
                  <CopyButton text={data.full_text} className="ml-auto" label="Copy all" />
                </div>
              )}
              {data.full_text ? (
                <pre className="card max-h-[34rem] overflow-auto whitespace-pre-wrap p-4 font-mono text-[12px] leading-relaxed text-ink-muted">
                  {data.full_text}
                </pre>
              ) : (
                <EmptyState icon={AlertTriangle} title="No text extracted" />
              )}
            </div>
          )}

          {tab === 'details' && (
            <Card className="p-4">
              <dl className="space-y-2.5 text-[13px]">
                {[
                  ['File name', data.original_filename],
                  ['MIME type', data.mime_type],
                  ['Size', formatBytes(data.size_bytes)],
                  ['Modality', data.modality],
                  ['Analysis source', data.analysis_source || '—'],
                  ['Segments', String(data.segment_count)],
                  ['Uploaded', new Date(data.created_at).toLocaleString()],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-line pb-2 last:border-0">
                    <dt className="text-ink-faint">{k}</dt>
                    <dd className="text-right font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function SegmentCard({
  segment, timed, onSeek,
}: {
  segment: Segment;
  timed: boolean;
  onSeek: (s?: number | null) => void;
}) {
  const where =
    segment.page_number != null
      ? `page ${segment.page_number}`
      : segment.slide_number != null
        ? `slide ${segment.slide_number}`
        : segment.start_sec != null
          ? timecode(segment.start_sec)
          : '';

  const clickable = timed && segment.start_sec != null;

  return (
    <Card className="p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{segment.kind.replace(/_/g, ' ')}</Badge>
        {segment.speaker && <Badge tone="accent">{segment.speaker}</Badge>}
        {where && (
          <button
            onClick={() => clickable && onSeek(segment.start_sec)}
            disabled={!clickable}
            className={`inline-flex items-center gap-1 font-mono text-[11px] ${
              clickable ? 'text-brand hover:underline' : 'cursor-default text-ink-faint'
            }`}
          >
            {clickable && <Clock className="h-3 w-3" />}
            {where}
          </button>
        )}
        {segment.confidence < 1 && (
          <span className="ml-auto font-mono text-[10px] text-ink-faint">
            {(segment.confidence * 100).toFixed(0)}% conf
          </span>
        )}
      </div>
      <p className="text-[13px] leading-relaxed text-ink-muted">{segment.text}</p>
    </Card>
  );
}

function MediaPreview({
  assetId, modality, mimeType, mediaRef,
}: {
  assetId: string;
  modality: string;
  mimeType: string;
  mediaRef: React.RefObject<HTMLVideoElement & HTMLAudioElement>;
}) {
  const url = mediaUrl(assetId);

  if (modality === 'image') {
    return (
      <Card className="overflow-hidden">
        <img src={url} alt="" className="max-h-[26rem] w-full bg-surface-2 object-contain" />
      </Card>
    );
  }

  if (modality === 'video') {
    return (
      <Card className="overflow-hidden">
        <video ref={mediaRef} src={url} controls preload="metadata" className="aspect-video w-full bg-black" />
      </Card>
    );
  }

  if (modality === 'audio') {
    return (
      <Card className="p-4">
        <audio ref={mediaRef} src={url} controls preload="metadata" className="w-full" />
        <p className="mt-2 text-[11px] text-ink-faint">Click any timestamp to jump to that moment.</p>
      </Card>
    );
  }

  if (mimeType === 'application/pdf') {
    return (
      <Card className="overflow-hidden">
        <iframe src={url} title="PDF preview" className="h-[26rem] w-full bg-surface-2" />
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <a href={url} target="_blank" rel="noreferrer">
        <Button variant="secondary" size="sm">
          <Download className="h-4 w-4" /> Open original file
        </Button>
      </a>
    </Card>
  );
}
