import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Captions, Clapperboard, Download, Film, Scissors, Sparkles, Wand2,
} from 'lucide-react';
import { jobApi, mediaApi, videoApi } from '@/services/endpoints';
import { downloadBlob } from '@/services/endpoints';
import { errorMessage, frameUrl, mediaUrl } from '@/services/api';
import { useProjectContext } from '@/hooks/useProjectContext';
import {
  Badge, Button, Card, DemoBadge, EmptyState, Progress, Select, Skeleton,
} from '@/components/ui';
import { CapabilityNote, PageHeader, ProjectSelector } from '@/components/shared';
import { formatDuration, timecode } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Highlight, Job } from '@/types';

const ASPECTS = [
  { id: '', label: 'Original' },
  { id: '16:9', label: '16:9 landscape' },
  { id: '9:16', label: '9:16 vertical' },
  { id: '1:1', label: '1:1 square' },
  { id: '4:5', label: '4:5 portrait' },
];

export default function VideoStudio() {
  const { mediaId } = useParams<{ mediaId?: string }>();
  const { projects, activeProjectId, setActiveProjectId } = useProjectContext();
  const [selectedId, setSelectedId] = useState<string | null>(mediaId ?? null);
  const navigate = useNavigate();

  const assets = useQuery({
    queryKey: ['media', activeProjectId],
    queryFn: () => mediaApi.list(activeProjectId!),
    enabled: !!activeProjectId,
  });

  const videos = useMemo(
    () => (assets.data ?? []).filter((a) => a.modality === 'video' && a.status === 'ready'),
    [assets.data],
  );

  useEffect(() => {
    if (!selectedId && videos.length) setSelectedId(videos[0].id);
    if (selectedId && videos.length && !videos.some((v) => v.id === selectedId)) {
      setSelectedId(videos[0].id);
    }
  }, [videos, selectedId]);

  if (!projects.length) {
    return (
      <EmptyState
        icon={Film}
        title="Create a project first"
        description="Upload a video into a project to use the studio."
        action={<Link to="/app"><Button>Go to dashboard</Button></Link>}
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Video Studio"
        subtitle="Scenes, highlights, frame-accurate clips, reframing and subtitles — all powered by FFmpeg on the server."
        actions={
          <>
            <ProjectSelector projects={projects} value={activeProjectId} onChange={setActiveProjectId} />
            {videos.length > 0 && (
              <Select
                value={selectedId ?? ''}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  navigate(`/app/video/${e.target.value}`, { replace: true });
                }}
                className="h-9 w-auto py-0"
              >
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title || v.original_filename}
                  </option>
                ))}
              </Select>
            )}
          </>
        }
      />

      {assets.isLoading ? (
        <Skeleton className="h-96" />
      ) : videos.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No processed videos in this project"
          description="Upload an MP4, MOV or WEBM and wait for it to finish processing."
          action={
            <Link to={`/app/projects/${activeProjectId}`}>
              <Button>Upload a video</Button>
            </Link>
          }
        />
      ) : selectedId ? (
        <StudioWorkspace key={selectedId} mediaId={selectedId} />
      ) : null}
    </div>
  );
}

function StudioWorkspace({ mediaId }: { mediaId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [range, setRange] = useState({ start: 0, end: 15 });
  const [aspect, setAspect] = useState('9:16');
  const [burn, setBurn] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const asset = useQuery({ queryKey: ['asset', mediaId], queryFn: () => mediaApi.get(mediaId) });
  const segments = useQuery({
    queryKey: ['video-segments', mediaId],
    queryFn: () => videoApi.segments(mediaId),
  });

  const duration = segments.data?.duration_sec ?? asset.data?.duration_sec ?? 0;

  useEffect(() => {
    if (duration) setRange({ start: 0, end: Math.min(15, duration) });
  }, [duration]);

  const highlights = useMutation({
    mutationFn: () =>
      videoApi.highlights(mediaId, { target_count: 5, min_sec: 10, max_sec: 60 }),
    onError: (err) => toast.error(errorMessage(err, 'Could not suggest highlights')),
  });

  const clip = useMutation({
    mutationFn: () =>
      videoApi.clip(mediaId, {
        start_sec: range.start,
        end_sec: range.end,
        aspect_ratio: aspect || null,
        burn_subtitles: burn,
        title: `${asset.data?.title || 'Clip'} ${timecode(range.start)}`,
      }),
    onSuccess: (job) => {
      setJobId(job.id);
      toast.info('Encoding started');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not start the clip job')),
  });

  const job = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => jobApi.get(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = (query.state.data as Job | undefined)?.status;
      return status === 'queued' || status === 'running' ? 1500 : false;
    },
  });

  useEffect(() => {
    if (job.data?.status === 'succeeded') {
      queryClient.invalidateQueries({ queryKey: ['media'] });
      toast.success('Clip ready');
    }
    if (job.data?.status === 'failed') {
      toast.error(job.data.error || 'Encoding failed');
    }
  }, [job.data?.status, job.data?.error, queryClient]);

  const downloadSubs = async (fmt: 'srt' | 'vtt') => {
    try {
      const blob = await videoApi.subtitles(mediaId, { fmt });
      downloadBlob(blob, `${(asset.data?.title || 'subtitles').slice(0, 40)}.${fmt}`);
    } catch (err) {
      toast.error(errorMessage(err, 'No transcript available'));
    }
  };

  const seek = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
    }
  };

  const applyHighlight = (h: Highlight) => {
    setRange({ start: h.start_sec, end: h.end_sec });
    seek(h.start_sec);
  };

  if (asset.isLoading) return <Skeleton className="h-96" />;

  const clipAsset = job.data?.result?.asset_id as string | undefined;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Player + timeline */}
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <video
            ref={videoRef}
            src={mediaUrl(mediaId)}
            controls
            preload="metadata"
            className="aspect-video w-full bg-black"
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5 text-[11px] text-ink-faint">
            <Badge tone="neutral">{formatDuration(duration)}</Badge>
            {asset.data?.width && (
              <Badge tone="neutral">
                {asset.data.width}×{asset.data.height}
              </Badge>
            )}
            <Badge tone="neutral">{segments.data?.scenes.length ?? 0} scenes</Badge>
            <Badge tone={segments.data?.has_transcript ? 'success' : 'warning'}>
              {segments.data?.has_transcript
                ? `${segments.data.transcript.length} transcript windows`
                : 'no transcript'}
            </Badge>
            <DemoBadge source={asset.data?.analysis_source} />
          </div>
        </Card>

        {segments.data?.note && <CapabilityNote needs="GEMINI_API_KEY" mode="scene detection only" />}

        {/* Scene strip */}
        {(segments.data?.frames.length ?? 0) > 0 && (
          <Card className="p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-faint">
              Frames — click to seek
            </h3>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {segments.data!.frames.map((f) => (
                <button
                  key={f.key}
                  onClick={() => seek(f.time_sec)}
                  className="group relative shrink-0 overflow-hidden rounded-lg border border-line transition-colors hover:border-brand"
                >
                  <img src={frameUrl(f.key)} alt="" loading="lazy" className="h-20 w-36 object-cover" />
                  <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 font-mono text-[9px] text-white">
                    {timecode(f.time_sec)}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Transcript */}
        {segments.data?.has_transcript && (
          <Card className="p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-faint">
              Transcript — click a timestamp to jump
            </h3>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {segments.data.transcript.map((t) => (
                <button
                  key={t.id}
                  onClick={() => seek(t.start_sec)}
                  className="flex w-full gap-3 rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
                >
                  <span className="shrink-0 font-mono text-[11px] text-brand">
                    {timecode(t.start_sec)}
                  </span>
                  <span className="text-[13px] leading-relaxed text-ink-muted">
                    {t.speaker && <span className="font-semibold text-ink">{t.speaker}: </span>}
                    {t.text}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-4">
        {/* Highlights */}
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-brand" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-faint">
              Highlight suggestions
            </h3>
          </div>

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => highlights.mutate()}
            loading={highlights.isPending}
          >
            <Sparkles className="h-4 w-4" /> Suggest clips
          </Button>

          {highlights.data && (
            <>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
                {highlights.data.note}
              </p>
              <div className="mt-2 space-y-2">
                {highlights.data.clips.length === 0 && (
                  <p className="text-[12px] text-ink-muted">No suitable moments found.</p>
                )}
                {highlights.data.clips.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => applyHighlight(h)}
                    className="w-full rounded-lg border border-line p-2.5 text-left transition-colors hover:border-brand/50 hover:bg-surface-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-brand">
                        {timecode(h.start_sec)}–{timecode(h.end_sec)}
                      </span>
                      <Badge tone="neutral">{h.duration_sec.toFixed(0)}s</Badge>
                      {h.suggested_platform && <Badge tone="accent">{h.suggested_platform}</Badge>}
                    </div>
                    <p className="mt-1 text-[12px] font-medium text-ink">{h.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">{h.reason}</p>
                    {h.review_note && (
                      <p className="mt-1 text-[10px] italic text-warning">{h.review_note}</p>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Clip cutter */}
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Scissors className="h-4 w-4 text-brand" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-faint">Cut a clip</h3>
          </div>

          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-ink-muted">
                <span>Start</span>
                <span className="font-mono text-brand">{timecode(range.start)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(1, duration)}
                step={0.5}
                value={range.start}
                onChange={(e) => {
                  const start = Number(e.target.value);
                  setRange((r) => ({ start, end: Math.max(start + 1, r.end) }));
                  seek(start);
                }}
                className="w-full accent-[rgb(var(--brand))]"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-ink-muted">
                <span>End</span>
                <span className="font-mono text-brand">{timecode(range.end)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(1, duration)}
                step={0.5}
                value={range.end}
                onChange={(e) => {
                  const end = Number(e.target.value);
                  setRange((r) => ({ start: Math.min(r.start, end - 1), end }));
                }}
                className="w-full accent-[rgb(var(--brand))]"
              />
            </div>

            <div className="rounded-lg bg-surface-2 px-3 py-2 text-center">
              <span className="font-mono text-sm font-semibold text-ink">
                {(range.end - range.start).toFixed(1)}s
              </span>
              <span className="ml-1.5 text-[11px] text-ink-faint">clip length</span>
            </div>

            <div>
              <span className="label">Aspect ratio</span>
              <div className="grid grid-cols-2 gap-1.5">
                {ASPECTS.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setAspect(a.id)}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors',
                      aspect === a.id
                        ? 'border-brand bg-brand/12 text-brand'
                        : 'border-line text-ink-muted hover:bg-surface-2',
                    )}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <label
              className={cn(
                'flex items-center gap-2.5 rounded-lg border border-line px-3 py-2',
                !segments.data?.has_transcript && 'opacity-50',
              )}
            >
              <input
                type="checkbox"
                checked={burn}
                disabled={!segments.data?.has_transcript}
                onChange={(e) => setBurn(e.target.checked)}
                className="h-3.5 w-3.5 accent-[rgb(var(--brand))]"
              />
              <span className="text-[12px] text-ink">Burn in subtitles</span>
              {!segments.data?.has_transcript && (
                <span className="ml-auto text-[10px] text-warning">needs transcript</span>
              )}
            </label>

            <Button
              className="w-full"
              onClick={() => clip.mutate()}
              loading={clip.isPending}
              disabled={range.end <= range.start}
            >
              <Clapperboard className="h-4 w-4" /> Export clip
            </Button>
          </div>

          {job.data && job.data.status !== 'succeeded' && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-ink-muted">{job.data.step || job.data.status}</span>
                <span className="font-mono text-brand">{job.data.progress}%</span>
              </div>
              <Progress value={job.data.progress} />
              {job.data.status === 'failed' && (
                <p className="text-[11px] text-danger">{job.data.error}</p>
              )}
            </div>
          )}

          {job.data?.status === 'succeeded' && clipAsset && (
            <div className="mt-3 space-y-2 rounded-lg border border-success/30 bg-success/[0.07] p-3">
              <p className="text-[12px] font-semibold text-success">
                Clip ready · {String(job.data.result.width)}×{String(job.data.result.height)}
              </p>
              <video src={mediaUrl(clipAsset)} controls className="w-full rounded-md bg-black" />
              <div className="flex gap-2">
                <a href={mediaUrl(clipAsset)} download className="flex-1">
                  <Button variant="secondary" size="sm" className="w-full">
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </a>
                <Link to={`/app/media/${clipAsset}`} className="flex-1">
                  <Button variant="ghost" size="sm" className="w-full">
                    Open
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </Card>

        {/* Subtitles */}
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Captions className="h-4 w-4 text-brand" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-faint">Subtitles</h3>
          </div>
          {segments.data?.has_transcript ? (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => downloadSubs('srt')}>
                <Download className="h-3.5 w-3.5" /> .srt
              </Button>
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => downloadSubs('vtt')}>
                <Download className="h-3.5 w-3.5" /> .vtt
              </Button>
            </div>
          ) : (
            <CapabilityNote needs="GEMINI_API_KEY" mode="no transcript" />
          )}
        </Card>
      </div>
    </div>
  );
}
