import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Check, CircleAlert, Key, Palette, Plug, Plus, Server, Trash2, User as UserIcon, X,
} from 'lucide-react';
import { authApi, studioApi, systemApi } from '@/services/endpoints';
import { errorMessage } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useCapabilities } from '@/hooks/useCapabilities';
import {
  Badge, Button, Card, ConfirmDialog, Dialog, Input, Select, Skeleton, Tabs, Textarea,
} from '@/components/ui';
import { PageHeader } from '@/components/shared';
import { formatBytes, titleCase } from '@/lib/format';
import type { BrandProfile } from '@/types';

type TabId = 'profile' | 'ai' | 'brand' | 'integrations' | 'appearance';

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const initial = (params.get('tab') as TabId) ?? 'profile';
  const [tab, setTab] = useState<TabId>(initial);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" subtitle="Your account, AI providers, brand voices and integrations." />

      <Tabs
        className="mb-6"
        value={tab}
        onChange={(id) => {
          setTab(id);
          setParams({ tab: id }, { replace: true });
        }}
        tabs={[
          { id: 'profile', label: 'Profile', icon: UserIcon },
          { id: 'ai', label: 'AI providers', icon: Key },
          { id: 'brand', label: 'Brand voice', icon: Palette },
          { id: 'integrations', label: 'Integrations', icon: Plug },
          { id: 'appearance', label: 'Appearance', icon: Palette },
        ]}
      />

      {tab === 'profile' && <ProfileTab />}
      {tab === 'ai' && <AiTab />}
      {tab === 'brand' && <BrandTab />}
      {tab === 'integrations' && <IntegrationsTab />}
      {tab === 'appearance' && <AppearanceTab />}
    </div>
  );
}

/* ------------------------------- Profile ------------------------------- */

function ProfileTab() {
  const { user, setUser } = useAuth();
  const [profile, setProfile] = useState({ full_name: '', bio: '' });
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });

  useEffect(() => {
    if (user) setProfile({ full_name: user.full_name, bio: user.bio ?? '' });
  }, [user]);

  const save = useMutation({
    mutationFn: () => authApi.updateMe(profile),
    onSuccess: (updated) => {
      setUser(updated);
      toast.success('Profile updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const changePassword = useMutation({
    mutationFn: () =>
      authApi.changePassword({
        current_password: pw.current_password,
        new_password: pw.new_password,
      }),
    onSuccess: () => {
      setPw({ current_password: '', new_password: '', confirm: '' });
      toast.success('Password changed');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const mismatch = pw.new_password.length > 0 && pw.new_password !== pw.confirm;
  const quota = 2048 * 1024 * 1024;

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-ink">Your profile</h2>
        <Input id="name" label="Name" value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} />
        <Input id="email" label="Email" value={user?.email ?? ''} disabled hint="Email cannot be changed." />
        <Textarea id="bio" label="Bio" value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} placeholder="Optional" />
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} loading={save.isPending}>Save profile</Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Storage</h2>
        <div className="mb-2 flex items-baseline justify-between text-[13px]">
          <span className="text-ink-muted">{formatBytes(user?.storage_used_bytes ?? 0)} used</span>
          <span className="text-ink-faint">of {formatBytes(quota)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand to-accent"
            style={{ width: `${Math.min(100, ((user?.storage_used_bytes ?? 0) / quota) * 100)}%` }}
          />
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-ink">Change password</h2>
        <Input
          id="cur" label="Current password" type="password" autoComplete="current-password"
          value={pw.current_password}
          onChange={(e) => setPw({ ...pw, current_password: e.target.value })}
        />
        <Input
          id="new" label="New password" type="password" autoComplete="new-password"
          value={pw.new_password}
          onChange={(e) => setPw({ ...pw, new_password: e.target.value })}
          hint="At least 8 characters, with a letter and a number."
        />
        <Input
          id="confirm" label="Confirm new password" type="password" autoComplete="new-password"
          value={pw.confirm}
          onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
          error={mismatch ? 'Passwords do not match' : undefined}
        />
        <div className="flex justify-end">
          <Button
            onClick={() => changePassword.mutate()}
            loading={changePassword.isPending}
            disabled={mismatch || pw.new_password.length < 8 || !pw.current_password}
          >
            Change password
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------- AI providers ----------------------------- */

function AiTab() {
  const { data: caps, isLoading } = useCapabilities();
  const aiHealth = useQuery({ queryKey: ['ai-health'], queryFn: systemApi.aiHealth, retry: false });

  if (isLoading) return <Skeleton className="h-72" />;

  const live = caps?.ai_mode === 'live';

  return (
    <div className="space-y-5">
      <Card className={`p-5 ${live ? 'border-success/40' : 'border-warning/40'}`}>
        <div className="flex items-start gap-3">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${live ? 'bg-success/12 text-success' : 'bg-warning/12 text-warning'}`}>
            {live ? <Check className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-ink">
              {live ? 'AI is configured and live' : 'Running in demo mode'}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              {live
                ? 'Transcription, vision understanding and real generation are all active.'
                : 'No valid Gemini API key. Text extraction, OCR, FFmpeg and search still work; generation is extractive and every result is badged “Demo”.'}
            </p>
            {aiHealth.data?.reason && (
              <p className="mt-2 rounded bg-surface-2 px-2.5 py-1.5 font-mono text-[11px] text-ink-faint">
                {String(aiHealth.data.reason)}
              </p>
            )}
          </div>
        </div>
      </Card>

      {!live && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink">Enable real AI</h2>
          <ol className="space-y-3 text-[13px] text-ink-muted">
            {[
              <>Get a free key at{' '}
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
                  aistudio.google.com/apikey
                </a>
              </>,
              <>Put it in <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-accent">backend/.env</code> as{' '}
                <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-accent">GEMINI_API_KEY=...</code></>,
              <>If your shell exports <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-accent">GEMINI_API_KEY</code>, unset it —
                shell variables override the .env file.</>,
              <>Restart the backend, then run{' '}
                <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-accent">./scripts/check.sh</code> to verify.</>,
            ].map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/12 font-mono text-[10px] font-bold text-brand">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12px] text-ink-muted">
            The key is read by the backend only. It is never sent to the browser and never appears in
            any API response.
          </p>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Server className="h-4 w-4 text-brand" /> What this deployment can do
        </h2>
        <div className="space-y-2">
          {Object.entries(caps?.features ?? {}).map(([name, feature]) => (
            <div key={name} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
              {feature.available ? (
                <Check className="h-4 w-4 shrink-0 text-success" />
              ) : (
                <X className="h-4 w-4 shrink-0 text-ink-faint" />
              )}
              <span className="text-[13px] font-medium text-ink">{titleCase(name)}</span>
              {feature.mode && <Badge tone="neutral">{feature.mode}</Badge>}
              {!feature.available && feature.needs && (
                <span className="ml-auto text-right text-[11px] text-warning">{feature.needs}</span>
              )}
              {feature.fallback && (
                <span className="ml-auto text-right text-[11px] text-ink-faint">
                  falls back to {feature.fallback}
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------ Brand voice ----------------------------- */

const EMPTY_BRAND = {
  name: '', description: '', tone: 'professional', audience: '',
  preferred_phrases: '', banned_phrases: '', writing_rules: '',
  emoji_policy: 'sparing', is_default: false,
};

function BrandTab() {
  const [editing, setEditing] = useState<BrandProfile | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BrandProfile | null>(null);
  const queryClient = useQueryClient();

  const brands = useQuery({ queryKey: ['brands'], queryFn: studioApi.brands });

  const remove = useMutation({
    mutationFn: (id: string) => studioApi.removeBrand(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      setPendingDelete(null);
      toast.success('Brand voice deleted');
    },
  });

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Brand voices</h2>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              A saved voice is injected into every generation prompt — tone, audience, phrases to use
              and phrases to never use.
            </p>
          </div>
          <Button size="sm" className="ml-auto shrink-0" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New
          </Button>
        </div>

        {brands.isLoading ? (
          <Skeleton className="h-24" />
        ) : (brands.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-faint">
            No brand voices yet. Create one to keep every output on-tone.
          </p>
        ) : (
          <div className="space-y-2">
            {brands.data!.map((brand) => (
              <div key={brand.id} className="flex items-center gap-3 rounded-lg border border-line p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[13px] font-semibold text-ink">{brand.name}</h3>
                    {brand.is_default && <Badge tone="brand">default</Badge>}
                    <Badge tone="neutral">{titleCase(brand.tone)}</Badge>
                  </div>
                  {brand.description && (
                    <p className="mt-0.5 truncate text-[12px] text-ink-muted">{brand.description}</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditing(brand)}>
                  Edit
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setPendingDelete(brand)} aria-label="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {(creating || editing) && (
        <BrandDialog
          brand={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
        title={`Delete “${pendingDelete?.name}”?`}
        body="Content already generated with this voice is unaffected."
        loading={remove.isPending}
      />
    </div>
  );
}

function BrandDialog({ brand, onClose }: { brand: BrandProfile | null; onClose: () => void }) {
  const [form, setForm] = useState(
    brand
      ? {
          name: brand.name, description: brand.description, tone: brand.tone,
          audience: brand.audience, preferred_phrases: brand.preferred_phrases,
          banned_phrases: brand.banned_phrases, writing_rules: brand.writing_rules,
          emoji_policy: brand.emoji_policy, is_default: brand.is_default,
        }
      : EMPTY_BRAND,
  );
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: () => (brand ? studioApi.updateBrand(brand.id, form) : studioApi.createBrand(form)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      toast.success(brand ? 'Brand voice updated' : 'Brand voice created');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={brand ? `Edit “${brand.name}”` : 'New brand voice'}
      description="These instructions go into every generation prompt that uses this voice."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={form.name.trim().length < 2}>
            {brand ? 'Save changes' : 'Create voice'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Input id="b-name" label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme — friendly expert" />
        <Input id="b-desc" label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select id="b-tone" label="Tone" value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })}>
            {['professional', 'educational', 'friendly', 'casual', 'entertaining', 'inspirational', 'technical'].map((t) => (
              <option key={t} value={t}>{titleCase(t)}</option>
            ))}
          </Select>
          <Select id="b-emoji" label="Emoji" value={form.emoji_policy} onChange={(e) => setForm({ ...form, emoji_policy: e.target.value })}>
            {['none', 'sparing', 'liberal'].map((t) => (
              <option key={t} value={t}>{titleCase(t)}</option>
            ))}
          </Select>
        </div>
        <Input id="b-aud" label="Audience" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} placeholder="Engineering leads at mid-size SaaS companies" />
        <Textarea id="b-pref" label="Words and phrases to lean on" value={form.preferred_phrases} onChange={(e) => setForm({ ...form, preferred_phrases: e.target.value })} className="min-h-[60px]" />
        <Textarea id="b-ban" label="Never use" value={form.banned_phrases} onChange={(e) => setForm({ ...form, banned_phrases: e.target.value })} placeholder="game-changer, revolutionary, in today's fast-paced world" className="min-h-[60px]" />
        <Textarea id="b-rules" label="Writing rules" value={form.writing_rules} onChange={(e) => setForm({ ...form, writing_rules: e.target.value })} placeholder="Short sentences. Always lead with the outcome. British spelling." className="min-h-[70px]" />
        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={form.is_default}
            onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
            className="h-3.5 w-3.5 accent-[rgb(var(--brand))]"
          />
          <span className="text-[13px] text-ink">Make this my default voice</span>
        </label>
      </div>
    </Dialog>
  );
}

/* ----------------------------- Integrations ---------------------------- */

function IntegrationsTab() {
  const social = useQuery({ queryKey: ['social'], queryFn: studioApi.social });

  if (social.isLoading) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">Publishing</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{social.data?.explanation}</p>
      </Card>

      <div className="space-y-2">
        {(social.data?.platforms ?? []).map((p: { platform: string; connected: boolean; setup_required: string[] }) => (
          <Card key={p.platform} className="p-4">
            <div className="flex items-center gap-3">
              <h3 className="text-[13px] font-semibold text-ink">{titleCase(p.platform)}</h3>
              <Badge tone={p.connected ? 'success' : 'neutral'}>
                {p.connected ? 'Connected' : 'Not connected'}
              </Badge>
              <Button variant="secondary" size="sm" className="ml-auto" disabled>
                Connect
              </Button>
            </div>
            {!p.connected && (
              <ol className="mt-3 space-y-1 border-t border-line pt-3">
                {p.setup_required.map((step, i) => (
                  <li key={i} className="flex gap-2 text-[12px] text-ink-muted">
                    <span className="font-mono text-ink-faint">{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- Appearance ------------------------------ */

function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold text-ink">Theme</h2>
      <p className="mb-4 text-[13px] text-ink-muted">Your choice is remembered on this device.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['dark', 'light'] as const).map((option) => (
          <button
            key={option}
            onClick={() => setTheme(option)}
            className={`rounded-xl border-2 p-4 text-left transition-colors ${
              theme === option ? 'border-brand bg-brand/[0.07]' : 'border-line hover:border-line'
            }`}
          >
            <div
              className={`mb-3 h-16 rounded-lg border border-line ${
                option === 'dark' ? 'bg-[#0e0e1e]' : 'bg-[#f9fafd]'
              }`}
            />
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-ink">{titleCase(option)}</span>
              {theme === option && <Check className="h-3.5 w-3.5 text-brand" />}
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}
