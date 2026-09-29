import { Link } from 'react-router-dom';
import {
  ArrowRight, BarChart3, Check, FileText, Image as ImageIcon, Layers, MessageSquare,
  Mic, Quote, Scissors, Sparkles, Video,
} from 'lucide-react';
import { Badge, Button } from '@/components/ui';

const PIPELINE = [
  {
    icon: Layers,
    title: 'Upload anything',
    body: 'Video, audio, images, PDFs, slide decks, documents. One drop zone, ten files at a time.',
  },
  {
    icon: FileText,
    title: 'Understand everything',
    body: 'Transcripts with timestamps, OCR on scans and screenshots, scene detection, page-level document parsing — all normalised into one searchable representation.',
  },
  {
    icon: Sparkles,
    title: 'Fuse across formats',
    body: 'Ask one question and get an answer drawn from a video, a PDF and a photo together — each claim cited back to a timestamp or a page number.',
  },
  {
    icon: Scissors,
    title: 'Create everywhere',
    body: 'Captions, scripts, blogs, quizzes, vertical clips with burned-in subtitles, thumbnails. Every output editable, versioned and traceable to its source.',
  },
];

const FEATURES = [
  { icon: Video, title: 'Video Studio', body: 'Scene detection, highlight suggestions, frame-accurate trimming, 9:16 / 1:1 / 4:5 reframing, and subtitle burn-in via FFmpeg.' },
  { icon: Mic, title: 'Audio & Podcast', body: 'Timestamped transcripts, chapter markers, show notes, SRT and VTT export, clip suggestions.' },
  { icon: ImageIcon, title: 'Image Studio', body: 'Vision descriptions, OCR text extraction, accessibility alt text, and thumbnail composition over real video frames.' },
  { icon: FileText, title: 'Document Studio', body: 'PDF, DOCX and PPTX parsing with page and slide numbers preserved, plus OCR fallback for scans.' },
  { icon: MessageSquare, title: 'Grounded AI chat', body: 'RAG over your own uploads. Cites its sources, and says "I don’t know" instead of inventing an answer.' },
  { icon: BarChart3, title: 'Production analytics', body: 'What you made, how long it took, what failed. Clearly separated from platform engagement metrics.' },
];

const USE_CASES = [
  { who: 'YouTubers', what: 'Turn one long upload into a title, a description with chapters, a thumbnail and five vertical clips.' },
  { who: 'Podcasters', what: 'Transcript, show notes, chapter markers, audiogram-ready highlights and a blog post from one recording.' },
  { who: 'Educators', what: 'Turn a lecture recording and its slide deck into study notes, a quiz and flashcards, with page references intact.' },
  { who: 'Agencies', what: 'Brand voice profiles keep every client’s output on-tone, with version history on every draft.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-surface-0/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-brand to-accent">
              <Sparkles className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
            </div>
            <span className="text-[15px] font-extrabold tracking-tight text-ink">
              Creator<span className="text-brand">AI</span>
            </span>
          </Link>

          <nav className="ml-auto flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link to="/register">
              <Button>Get started free</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
        <Badge tone="brand" className="mb-5">
          <Sparkles className="h-3 w-3" />
          Multimodal AI content studio
        </Badge>

        <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-6xl">
          Upload once.
          <br />
          <span className="bg-gradient-to-r from-brand to-accent bg-clip-text text-transparent">
            Create content everywhere.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
          CreatorAI reads your video, audio, images and documents together — then writes the
          captions, scripts, articles and clips that come out of them. Every sentence it generates
          traces back to the timestamp or page it came from.
        </p>

        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link to="/register">
            <Button size="lg">
              Start creating <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/login">
            <Button size="lg" variant="secondary">
              Sign in
            </Button>
          </Link>
        </div>

        <p className="mt-4 text-xs text-ink-faint">
          Free to run locally. Works without an AI key in a clearly-labelled demo mode.
        </p>

        <HeroPreview />
      </section>

      {/* Pipeline */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <h2 className="mb-2 text-center text-sm font-bold uppercase tracking-widest text-ink-faint">
          How it works
        </h2>
        <p className="mx-auto mb-10 max-w-xl text-center text-sm text-ink-muted">
          The interesting part is step three: information from different formats is combined, not
          just stored side by side.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE.map((step, i) => (
            <div key={step.title} className="card p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand/12 text-brand">
                  <step.icon className="h-5 w-5" />
                </div>
                <span className="font-mono text-xs text-ink-faint">0{i + 1}</span>
              </div>
              <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <h2 className="mb-10 text-center text-sm font-bold uppercase tracking-widest text-ink-faint">
          Every studio you need
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5 transition-colors hover:border-brand/40">
              <f.icon className="h-5 w-5 text-brand" />
              <h3 className="mt-3 text-sm font-semibold text-ink">{f.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        <div className="card p-7 sm:p-9">
          <h2 className="text-xl font-bold text-ink sm:text-2xl">Built for people who publish</h2>
          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            {USE_CASES.map((c) => (
              <div key={c.who}>
                <h3 className="text-sm font-semibold text-brand">{c.who}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{c.what}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Honesty section — unusual, and the point */}
      <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        <div className="card border-brand/25 p-7 sm:p-9">
          <Quote className="h-6 w-6 text-brand" />
          <h2 className="mt-3 text-xl font-bold text-ink">What it will not do</h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              'Invent a statistic your sources never mentioned.',
              'Claim a clip will go viral — it has no performance data.',
              'Say a post was published when no platform is connected.',
              'Pass off demo output as a real model response.',
            ].map((item) => (
              <li key={item} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-muted">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <h2 className="mb-10 text-center text-sm font-bold uppercase tracking-widest text-ink-faint">
          Pricing
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              name: 'Self-hosted',
              price: 'Free',
              sub: 'Run it yourself',
              features: ['Unlimited projects', 'All studios', 'Bring your own AI key', 'Full source code'],
              cta: 'Get started',
              highlight: true,
            },
            {
              name: 'Creator',
              price: '$19',
              sub: 'per month',
              features: ['Hosted and managed', '50 GB media storage', 'Priority processing queue', 'Email support'],
              cta: 'Coming soon',
              disabled: true,
            },
            {
              name: 'Team',
              price: '$79',
              sub: 'per month',
              features: ['Everything in Creator', 'Shared brand voices', 'Team workspaces', 'Publishing integrations'],
              cta: 'Coming soon',
              disabled: true,
            },
          ].map((tier) => (
            <div
              key={tier.name}
              className={`card flex flex-col p-6 ${tier.highlight ? 'border-brand/50 ring-1 ring-brand/20' : ''}`}
            >
              <h3 className="text-sm font-semibold text-ink">{tier.name}</h3>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold text-ink">{tier.price}</span>
                <span className="text-xs text-ink-faint">{tier.sub}</span>
              </div>
              <ul className="mt-5 flex-1 space-y-2.5">
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2 text-[13px] text-ink-muted">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              {tier.disabled ? (
                <Button variant="secondary" className="mt-6" disabled>
                  {tier.cta}
                </Button>
              ) : (
                <Link to="/register" className="mt-6">
                  <Button className="w-full">{tier.cta}</Button>
                </Link>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-ink-faint">
          Hosted plans are not live yet. Those buttons are disabled rather than pretending to work.
        </p>
      </section>

      <footer className="border-t border-line px-4 py-8 text-center text-xs text-ink-faint">
        CreatorAI — a multimodal AI content studio. Built with React, FastAPI, PostgreSQL + pgvector,
        FFmpeg and Google Gemini.
      </footer>
    </div>
  );
}

/** A static illustration of cross-modal fusion: one answer, three formats. */
function HeroPreview() {
  return (
    <div className="mx-auto mt-16 max-w-3xl text-left">
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <MessageSquare className="h-4 w-4 text-brand" />
          <span className="text-sm font-medium text-ink">
            “Summarise the lecture and pull the key numbers.”
          </span>
        </div>

        <div className="space-y-3 p-4">
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Validation accuracy peaked at{' '}
            <span className="font-semibold text-ink">91.2% after 12 epochs</span>
            <Cite n={1} /> before overfitting set in. The recommended fix on the slides is dropout at{' '}
            <span className="font-semibold text-ink">0.5 for fully connected layers</span>
            <Cite n={2} />, which the speaker demonstrates on screen
            <Cite n={3} />.
          </p>

          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { n: 1, icon: FileText, name: 'lecture-notes.pdf', where: 'page 3' },
              { n: 2, icon: ImageIcon, name: 'slide-photo.jpg', where: 'OCR' },
              { n: 3, icon: Video, name: 'lecture-04.mp4', where: '14:22' },
            ].map((s) => (
              <div key={s.n} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2">
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded border border-brand/40 bg-brand/12 font-mono text-[9px] font-bold text-brand">
                  {s.n}
                </span>
                <s.icon className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-medium text-ink">{s.name}</div>
                  <div className="font-mono text-[10px] text-ink-faint">{s.where}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-ink-faint">
        One answer, assembled from a document, a photo and a video — each claim traceable.
      </p>
    </div>
  );
}

function Cite({ n }: { n: number }) {
  return (
    <sup className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded border border-brand/40 bg-brand/12 px-1 font-mono text-[9px] font-bold text-brand">
      {n}
    </sup>
  );
}
