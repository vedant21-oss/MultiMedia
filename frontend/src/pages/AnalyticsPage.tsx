import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { AlertTriangle, BarChart3, CheckCircle2, Clock, HardDrive, Info } from 'lucide-react';
import { studioApi } from '@/services/endpoints';
import { useProjectContext } from '@/hooks/useProjectContext';
import { Badge, Card, EmptyState, Select, Skeleton } from '@/components/ui';
import { PageHeader, ProjectSelector } from '@/components/shared';
import { formatBytes, titleCase } from '@/lib/format';

// A single ordered palette keeps every chart on this page visually consistent.
const SERIES = ['#8b5cf6', '#22d3ee', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#60a5fa'];

const AXIS = { stroke: 'rgb(var(--ink-faint))', fontSize: 11 };

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface-1 px-3 py-2 shadow-lg">
      {label && <p className="mb-1 text-[11px] font-semibold text-ink">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-[11px] text-ink-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold text-ink">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [scoped, setScoped] = useState(true);
  const { projects, activeProjectId, setActiveProjectId } = useProjectContext();

  const analytics = useQuery({
    queryKey: ['analytics', days, scoped ? activeProjectId : null],
    queryFn: () =>
      studioApi.analytics({
        days,
        ...(scoped && activeProjectId ? { project_id: activeProjectId } : {}),
      }),
  });

  if (analytics.isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-5">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const data = analytics.data;
  if (!data) {
    return <EmptyState icon={BarChart3} title="No analytics yet" description="Upload something first." />;
  }

  const { totals, processing } = data;
  const hasAnything = totals.assets > 0 || totals.generated_content > 0;

  const daily = mergeDaily(data.daily.assets, data.daily.content);
  const modality = toPie(data.by_modality);
  const contentTypes = toBars(data.by_content_type, 8);
  const platforms = toPie(data.by_platform);

  const storagePct = totals.storage_quota_bytes
    ? Math.round((totals.storage_used_bytes / totals.storage_quota_bytes) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Analytics"
        subtitle="What you have produced inside CreatorAI."
        actions={
          <>
            {projects.length > 1 && (
              <button
                onClick={() => setScoped((v) => !v)}
                className={`chip ${scoped ? 'border-brand/50 bg-brand/12 text-brand' : 'border-line bg-surface-2 text-ink-muted'}`}
              >
                {scoped ? 'This project' : 'All projects'}
              </button>
            )}
            {scoped && (
              <ProjectSelector projects={projects} value={activeProjectId} onChange={setActiveProjectId} />
            )}
            <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="h-9 w-auto py-0">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </Select>
          </>
        }
      />

      <div className="mb-5 flex gap-2.5 rounded-xl border border-accent/25 bg-accent/[0.06] px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <p className="text-[13px] leading-relaxed text-ink-muted">{data.disclaimer}</p>
      </div>

      {!hasAnything ? (
        <EmptyState
          icon={BarChart3}
          title="Nothing to chart yet"
          description="Upload media and generate some content — production numbers show up here."
        />
      ) : (
        <div className="space-y-5">
          {/* KPI row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={CheckCircle2}
              label="Processing success"
              value={processing.success_rate != null ? `${processing.success_rate}%` : '—'}
              sub={`${processing.succeeded} succeeded · ${processing.failed} failed`}
              tone={processing.failed > 0 ? 'warning' : 'success'}
            />
            <Kpi
              icon={Clock}
              label="Avg processing time"
              value={processing.avg_processing_ms ? `${(processing.avg_processing_ms / 1000).toFixed(1)}s` : '—'}
              sub="per source"
            />
            <Kpi
              icon={BarChart3}
              label="Content generated"
              value={String(totals.generated_content)}
              sub={`${totals.drafts} drafts · ${totals.scheduled} scheduled`}
            />
            <Kpi
              icon={HardDrive}
              label="Storage used"
              value={formatBytes(totals.storage_used_bytes)}
              sub={`${storagePct}% of ${formatBytes(totals.storage_quota_bytes)}`}
              tone={storagePct > 85 ? 'warning' : undefined}
            />
          </div>

          {/* Production over time */}
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">Production over time</h2>
            {daily.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-faint">
                No activity in this window.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={daily} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gAssets" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={SERIES[0]} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={SERIES[0]} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gContent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={SERIES[1]} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={SERIES[1]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
                  <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    type="monotone" dataKey="Uploads" stroke={SERIES[0]}
                    strokeWidth={2} fill="url(#gAssets)"
                  />
                  <Area
                    type="monotone" dataKey="Generated" stroke={SERIES[1]}
                    strokeWidth={2} fill="url(#gContent)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold text-ink">Sources by format</h2>
              {modality.length === 0 ? (
                <p className="py-10 text-center text-sm text-ink-faint">No uploads yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={modality} dataKey="value" nameKey="name"
                      innerRadius={58} outerRadius={92} paddingAngle={2} strokeWidth={0}
                    >
                      {modality.map((_, i) => (
                        <Cell key={i} fill={SERIES[i % SERIES.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold text-ink">Content by type</h2>
              {contentTypes.length === 0 ? (
                <p className="py-10 text-center text-sm text-ink-faint">Nothing generated yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={contentTypes} layout="vertical" margin={{ left: 34, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" horizontal={false} />
                    <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis
                      type="category" dataKey="name" tick={{ ...AXIS, fontSize: 10 }}
                      tickLine={false} axisLine={false} width={110}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(var(--surface-2))' }} />
                    <Bar dataKey="value" name="Pieces" radius={[0, 4, 4, 0]}>
                      {contentTypes.map((_, i) => (
                        <Cell key={i} fill={SERIES[i % SERIES.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {platforms.length > 0 && (
            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-ink">Content by platform</h2>
                <Badge tone="neutral">what you made, not how it performed</Badge>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={platforms} margin={{ left: -18, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--line))" vertical={false} />
                  <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(var(--surface-2))' }} />
                  <Bar dataKey="value" name="Pieces" radius={[4, 4, 0, 0]}>
                    {platforms.map((_, i) => (
                      <Cell key={i} fill={SERIES[i % SERIES.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {totals.assets_failed > 0 && (
            <Card className="flex gap-3 border-warning/40 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-[13px] leading-relaxed text-ink-muted">
                <span className="font-semibold text-warning">
                  {totals.assets_failed} source{totals.assets_failed === 1 ? '' : 's'} failed to process.
                </span>{' '}
                Open the project and use “Re-analyse” — the error is recorded on each one.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, sub, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: 'success' | 'warning';
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-ink-faint">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div
        className={`mt-1.5 text-2xl font-bold ${
          tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-ink'
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-ink-faint">{sub}</div>}
    </Card>
  );
}

function mergeDaily(
  assets: { date: string; count: number }[],
  content: { date: string; count: number }[],
) {
  const map = new Map<string, { date: string; Uploads: number; Generated: number }>();
  const put = (date: string, key: 'Uploads' | 'Generated', count: number) => {
    const short = date.slice(5); // MM-DD
    const row = map.get(short) ?? { date: short, Uploads: 0, Generated: 0 };
    row[key] += count;
    map.set(short, row);
  };
  assets.forEach((a) => put(a.date, 'Uploads', a.count));
  content.forEach((c) => put(c.date, 'Generated', c.count));
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function toPie(record: Record<string, number>) {
  return Object.entries(record)
    .filter(([name, value]) => value > 0 && name !== 'none')
    .map(([name, value]) => ({ name: titleCase(name), value }));
}

function toBars(record: Record<string, number>, limit: number) {
  return Object.entries(record)
    .filter(([, value]) => value > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([name, value]) => ({ name: titleCase(name), value }));
}
