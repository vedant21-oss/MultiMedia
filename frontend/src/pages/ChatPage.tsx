import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle, Check, FileStack, MessageSquare, Plus, Send, Trash2,
} from 'lucide-react';
import { chatApi, mediaApi } from '@/services/endpoints';
import { errorMessage } from '@/services/api';
import { useProjectContext } from '@/hooks/useProjectContext';
import {
  Badge, Button, Card, CopyButton, DemoBadge, EmptyState, Skeleton, Spinner,
} from '@/components/ui';
import {
  CitationCard, ModalityIcon, PageHeader, ProjectSelector, RichText,
} from '@/components/shared';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { ChatMessage } from '@/types';

const SUGGESTIONS = [
  'Summarise everything I uploaded.',
  'What are the key numbers across these sources?',
  'Find the part where the main concept is explained.',
  'Write five Instagram posts from this material.',
];

const CONFIDENCE_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  high: 'success',
  medium: 'warning',
  low: 'danger',
  insufficient_evidence: 'danger',
};

export default function ChatPage() {
  const { projects, activeProjectId, setActiveProjectId } = useProjectContext();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [scope, setScope] = useState<string[]>([]);
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const assets = useQuery({
    queryKey: ['media', activeProjectId],
    queryFn: () => mediaApi.list(activeProjectId!),
    enabled: !!activeProjectId,
  });

  const conversations = useQuery({
    queryKey: ['conversations', activeProjectId],
    queryFn: () => chatApi.conversations(activeProjectId!),
    enabled: !!activeProjectId,
  });

  const messages = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => chatApi.messages(conversationId!),
    enabled: !!conversationId,
  });

  useEffect(() => {
    setConversationId(null);
    setPending([]);
    setScope([]);
  }, [activeProjectId]);

  const history = useMemo(
    () => [...(messages.data ?? []), ...pending],
    [messages.data, pending],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history.length]);

  const send = useMutation({
    mutationFn: (text: string) =>
      chatApi.send({
        project_id: activeProjectId!,
        message: text,
        conversation_id: conversationId,
        asset_ids: scope,
      }),
    onMutate: (text) => {
      setPending([
        {
          id: `local-${Date.now()}`,
          role: 'user',
          content: text,
          confidence: '',
          generation_source: 'live',
          latency_ms: 0,
          created_at: new Date().toISOString(),
          citations: [],
        },
      ]);
      setInput('');
    },
    onSuccess: (data) => {
      setConversationId(data.conversation_id);
      setPending([]);
      queryClient.invalidateQueries({ queryKey: ['messages', data.conversation_id] });
      queryClient.invalidateQueries({ queryKey: ['conversations', activeProjectId] });
    },
    onError: (err) => {
      setPending([]);
      toast.error(errorMessage(err, 'Could not answer that'));
    },
  });

  const removeConversation = useMutation({
    mutationFn: (id: string) => chatApi.remove(id),
    onSuccess: (_d, id) => {
      if (conversationId === id) setConversationId(null);
      queryClient.invalidateQueries({ queryKey: ['conversations', activeProjectId] });
      toast.success('Conversation deleted');
    },
  });

  const ready = (assets.data ?? []).filter((a) => a.status === 'ready');

  if (!projects.length) {
    return (
      <EmptyState
        icon={FileStack}
        title="Create a project first"
        description="Chat answers from the media inside a project."
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
        title="AI Content Chat"
        subtitle="Grounded in your uploads. Every claim cites the timestamp or page it came from."
        actions={
          <ProjectSelector projects={projects} value={activeProjectId} onChange={setActiveProjectId} />
        }
      />

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Sidebar: conversations + source scope */}
        <div className="space-y-4">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setConversationId(null);
              setPending([]);
            }}
          >
            <Plus className="h-4 w-4" /> New conversation
          </Button>

          <Card className="p-3">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              Limit to sources
            </h3>
            {ready.length === 0 ? (
              <p className="text-[12px] text-ink-muted">Nothing processed yet.</p>
            ) : (
              <div className="max-h-52 space-y-1 overflow-y-auto">
                {ready.map((asset) => {
                  const checked = scope.includes(asset.id);
                  return (
                    <button
                      key={asset.id}
                      onClick={() =>
                        setScope((prev) =>
                          checked ? prev.filter((id) => id !== asset.id) : [...prev, asset.id],
                        )
                      }
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
                        checked ? 'border-brand/50 bg-brand/[0.08]' : 'border-transparent hover:bg-surface-2',
                      )}
                    >
                      <span
                        className={cn(
                          'grid h-3.5 w-3.5 shrink-0 place-items-center rounded border',
                          checked ? 'border-brand bg-brand text-white' : 'border-line',
                        )}
                      >
                        {checked && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                      </span>
                      <ModalityIcon modality={asset.modality} className="h-3 w-3 shrink-0 text-ink-faint" />
                      <span className="truncate text-[11px] text-ink">
                        {asset.title || asset.original_filename}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {scope.length > 0 && (
              <button
                onClick={() => setScope([])}
                className="mt-2 text-[11px] font-medium text-ink-faint hover:text-brand"
              >
                Use all sources
              </button>
            )}
          </Card>

          <Card className="p-3">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              History
            </h3>
            {conversations.isLoading ? (
              <Skeleton className="h-16" />
            ) : (conversations.data ?? []).length === 0 ? (
              <p className="text-[12px] text-ink-muted">No conversations yet.</p>
            ) : (
              <div className="space-y-1">
                {conversations.data!.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      'group flex items-center gap-1.5 rounded-md px-2 py-1.5',
                      conversationId === c.id ? 'bg-brand/[0.1]' : 'hover:bg-surface-2',
                    )}
                  >
                    <button
                      onClick={() => {
                        setConversationId(c.id);
                        setPending([]);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-[12px] text-ink">{c.title}</span>
                      <span className="text-[10px] text-ink-faint">
                        {c.message_count} messages · {relativeTime(c.updated_at)}
                      </span>
                    </button>
                    <button
                      onClick={() => removeConversation.mutate(c.id)}
                      className="rounded p-1 text-ink-faint opacity-0 hover:text-danger group-hover:opacity-100"
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Thread */}
        <Card className="flex min-h-[70vh] flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {history.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-brand/12 text-brand">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <h3 className="text-base font-semibold text-ink">Ask about your media</h3>
                <p className="mt-1.5 max-w-md text-sm text-ink-muted">
                  Questions are answered only from what you uploaded. If the sources do not cover it,
                  the answer says so rather than guessing.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send.mutate(s)}
                      disabled={!ready.length}
                      className="rounded-full border border-line px-3 py-1.5 text-[11px] text-ink-muted transition-colors hover:border-brand/50 hover:text-brand disabled:opacity-40"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {!ready.length && (
                  <p className="mt-4 text-[12px] text-warning">
                    Upload and process a source first.
                  </p>
                )}
              </div>
            )}

            {history.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                highlighted={highlighted}
                onCitation={(marker) => {
                  const citation = message.citations.find((c) => c.marker === marker);
                  if (!citation?.segment_id) return;
                  setHighlighted(citation.segment_id);
                  document
                    .getElementById(`citation-${citation.segment_id}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              />
            ))}

            {send.isPending && (
              <div className="flex justify-start">
                <Card className="px-4 py-3">
                  <Spinner label="Searching your sources…" />
                </Card>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <form
            className="flex gap-2 border-t border-line p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim().length > 0) send.mutate(input.trim());
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                ready.length ? 'Ask anything about your uploads…' : 'Upload a source first'
              }
              disabled={!ready.length || send.isPending}
              className="input flex-1"
              maxLength={4000}
            />
            <Button type="submit" disabled={!input.trim() || send.isPending || !ready.length}>
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Send</span>
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function MessageBubble({
  message, onCitation, highlighted,
}: {
  message: ChatMessage;
  onCitation: (marker: number) => void;
  highlighted: string | null;
}) {
  const isUser = message.role === 'user';
  const insufficient = message.confidence === 'insufficient_evidence';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-xl rounded-br-sm bg-brand px-4 py-2.5 text-sm text-brand-ink">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-3">
      <Card className={cn('p-4', insufficient && 'border-warning/40')}>
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <Badge tone="brand">
            <MessageSquare className="h-3 w-3" /> Answer
          </Badge>
          {message.confidence && (
            <Badge tone={CONFIDENCE_TONE[message.confidence] ?? 'neutral'}>
              {message.confidence === 'insufficient_evidence' ? (
                <>
                  <AlertTriangle className="h-3 w-3" /> not in your sources
                </>
              ) : (
                `${message.confidence} confidence`
              )}
            </Badge>
          )}
          <DemoBadge source={message.generation_source} />
          <div className="ml-auto flex items-center gap-1">
            {message.latency_ms > 0 && (
              <span className="font-mono text-[10px] text-ink-faint">
                {(message.latency_ms / 1000).toFixed(1)}s
              </span>
            )}
            <CopyButton text={message.content} />
          </div>
        </div>

        <RichText text={message.content} onCitation={onCitation} />
      </Card>

      {message.citations.length > 0 && (
        <div className="space-y-2 pl-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
            Sources ({message.citations.length})
          </p>
          {message.citations.map((c) => (
            <CitationCard
              key={c.segment_id ?? c.marker}
              citation={c}
              highlighted={highlighted === c.segment_id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
