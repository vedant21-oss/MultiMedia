import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth,
  isToday, startOfMonth, startOfWeek, subMonths,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, Info, Plus, Trash2 } from 'lucide-react';
import { studioApi } from '@/services/endpoints';
import { errorMessage } from '@/services/api';
import { useProjectContext } from '@/hooks/useProjectContext';
import {
  Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Input, Select, Skeleton, Textarea,
} from '@/components/ui';
import { PageHeader, ProjectSelector } from '@/components/shared';
import { titleCase } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { CalendarEntry } from '@/types';

const PLATFORMS = ['none', 'youtube', 'instagram', 'linkedin', 'tiktok', 'x', 'facebook', 'blog', 'newsletter'];
const STATUSES = ['draft', 'approved', 'scheduled', 'published', 'archived'];

const STATUS_TONE: Record<string, 'neutral' | 'brand' | 'success' | 'warning'> = {
  draft: 'neutral',
  approved: 'brand',
  scheduled: 'warning',
  published: 'success',
  archived: 'neutral',
};

export default function PlannerPage() {
  const [month, setMonth] = useState(new Date());
  const [creating, setCreating] = useState<Date | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CalendarEntry | null>(null);
  const { projects, activeProjectId, setActiveProjectId } = useProjectContext();
  const queryClient = useQueryClient();

  const rangeStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const rangeEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });

  const entries = useQuery({
    queryKey: ['calendar', activeProjectId, format(month, 'yyyy-MM')],
    queryFn: () =>
      studioApi.calendar({
        project_id: activeProjectId ?? '',
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString(),
      }),
    enabled: !!activeProjectId,
  });

  const social = useQuery({ queryKey: ['social'], queryFn: studioApi.social });

  const remove = useMutation({
    mutationFn: (id: string) => studioApi.removeEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      setPendingDelete(null);
      toast.success('Entry removed');
    },
  });

  const days = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of entries.data ?? []) {
      const key = format(new Date(entry.scheduled_for), 'yyyy-MM-dd');
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return map;
  }, [entries.data]);

  if (!projects.length) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Create a project first"
        description="The planner schedules content inside a project."
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Social Media Planner"
        subtitle="Plan what goes out and when. Status is tracked here; publishing is not connected."
        actions={
          <>
            <ProjectSelector projects={projects} value={activeProjectId} onChange={setActiveProjectId} />
            <Button onClick={() => setCreating(new Date())}>
              <Plus className="h-4 w-4" /> New entry
            </Button>
          </>
        }
      />

      {social.data && !social.data.publishing_enabled && (
        <div className="mb-5 flex gap-2.5 rounded-xl border border-line bg-surface-1 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="text-[13px] leading-relaxed text-ink-muted">
            <span className="font-semibold text-ink">Publishing is not connected. </span>
            {social.data.explanation}
          </p>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{format(month, 'MMMM yyyy')}</h2>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setMonth(subMonths(month, 1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setMonth(new Date())}>
              Today
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-line bg-surface-2/50">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-ink-faint">
              {d}
            </div>
          ))}
        </div>

        {entries.isLoading ? (
          <Skeleton className="h-96" />
        ) : (
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayEntries = byDay.get(key) ?? [];
              const outside = !isSameMonth(day, month);

              return (
                <button
                  key={key}
                  onClick={() => setCreating(day)}
                  className={cn(
                    'min-h-[104px] border-b border-r border-line p-1.5 text-left align-top transition-colors hover:bg-surface-2',
                    outside && 'bg-surface-2/30',
                  )}
                >
                  <span
                    className={cn(
                      'inline-grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold',
                      isToday(day) ? 'bg-brand text-brand-ink' : outside ? 'text-ink-faint' : 'text-ink-muted',
                    )}
                  >
                    {format(day, 'd')}
                  </span>

                  <div className="mt-1 space-y-1">
                    {dayEntries.slice(0, 3).map((entry) => (
                      <div
                        key={entry.id}
                        className="group flex items-center gap-1 rounded border border-line bg-surface-1 px-1.5 py-1"
                      >
                        <span
                          className={cn(
                            'h-1.5 w-1.5 shrink-0 rounded-full',
                            entry.status === 'published' ? 'bg-success'
                              : entry.status === 'scheduled' ? 'bg-warning' : 'bg-brand',
                          )}
                        />
                        <span className="truncate text-[10px] text-ink">{entry.title}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDelete(entry);
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && setPendingDelete(entry)}
                          className="ml-auto opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="h-2.5 w-2.5 text-ink-faint hover:text-danger" />
                        </span>
                      </div>
                    ))}
                    {dayEntries.length > 3 && (
                      <p className="px-1 text-[9px] text-ink-faint">+{dayEntries.length - 3} more</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Upcoming list */}
      {(entries.data ?? []).length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-faint">
            This month ({entries.data!.length})
          </h2>
          <div className="space-y-2">
            {entries.data!.map((entry) => (
              <Card key={entry.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="w-16 shrink-0 text-center">
                  <div className="text-[10px] uppercase text-ink-faint">
                    {format(new Date(entry.scheduled_for), 'MMM')}
                  </div>
                  <div className="text-lg font-bold leading-none text-ink">
                    {format(new Date(entry.scheduled_for), 'd')}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium text-ink">{entry.title}</h3>
                  {entry.notes && <p className="truncate text-[12px] text-ink-muted">{entry.notes}</p>}
                </div>
                {entry.platform !== 'none' && <Badge tone="accent">{titleCase(entry.platform)}</Badge>}
                <Badge tone={STATUS_TONE[entry.status] ?? 'neutral'}>{titleCase(entry.status)}</Badge>
                {entry.campaign && <Badge tone="neutral">{entry.campaign}</Badge>}
                <Button variant="ghost" size="icon" onClick={() => setPendingDelete(entry)} aria-label="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {creating && (
        <EntryDialog date={creating} projectId={activeProjectId!} onClose={() => setCreating(null)} />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
        title="Remove this entry?"
        body="The planned entry is deleted. Any generated content it referenced stays in your library."
        confirmLabel="Remove"
        loading={remove.isPending}
      />
    </div>
  );
}

function EntryDialog({
  date, projectId, onClose,
}: {
  date: Date;
  projectId: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: '',
    notes: '',
    platform: 'instagram',
    status: 'draft',
    campaign: '',
    time: '09:00',
  });
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: () => {
      const [hours, minutes] = form.time.split(':').map(Number);
      const when = new Date(date);
      when.setHours(hours, minutes, 0, 0);
      return studioApi.createEntry({
        project_id: projectId,
        title: form.title,
        notes: form.notes,
        platform: form.platform,
        status: form.status,
        campaign: form.campaign,
        scheduled_for: when.toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      toast.success('Entry planned');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Plan for ${format(date, 'EEEE d MMMM')}`}
      description="Scheduling here is a plan and a reminder. Nothing is published automatically."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            loading={create.isPending}
            disabled={!form.title.trim()}
          >
            Add to calendar
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Input
          id="entry-title"
          label="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Launch teaser — vertical clip"
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            id="entry-platform"
            label="Platform"
            value={form.platform}
            onChange={(e) => setForm({ ...form, platform: e.target.value })}
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{titleCase(p)}</option>
            ))}
          </Select>
          <Input
            id="entry-time"
            label="Time"
            type="time"
            value={form.time}
            onChange={(e) => setForm({ ...form, time: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            id="entry-status"
            label="Status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            {STATUSES.filter((s) => s !== 'published').map((s) => (
              <option key={s} value={s}>{titleCase(s)}</option>
            ))}
          </Select>
          <Input
            id="entry-campaign"
            label="Campaign"
            value={form.campaign}
            onChange={(e) => setForm({ ...form, campaign: e.target.value })}
            placeholder="Optional"
          />
        </div>
        <Textarea
          id="entry-notes"
          label="Notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Hook, asset to use, anything to remember."
        />
        <p className="text-[11px] text-ink-faint">
          “Published” can only be set by a real platform integration, so it is not offered here.
        </p>
      </div>
    </Dialog>
  );
}
