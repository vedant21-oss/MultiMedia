import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { Hero3D } from '@/components/Hero3D';

const STORY = [
  { lead: 'Video. Audio. Slides. Photos.', tail: 'Drop them in one place.' },
  { lead: 'Understood together.', tail: 'Speech, pages and frames in one index.' },
  { lead: 'Turned into content.', tail: 'Every line cites its source.' },
];

const FEATURES = [
  { n: '01', title: 'Ask', body: 'Chat with your media. Answers cite the exact second or page.' },
  { n: '02', title: 'Clip', body: 'Find highlights, reframe to 9:16, burn in subtitles.' },
  { n: '03', title: 'Write', body: 'Posts, scripts and threads in your brand voice.' },
];

/** 0 → 1 as the element scrolls through the viewport while pinned. */
function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      setProgress(Math.min(1, Math.max(0, -r.top / (span || 1))));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);
  return { ref, progress };
}

export default function Landing() {
  const story = useScrollProgress<HTMLElement>();
  const active = Math.min(STORY.length - 1, Math.floor(story.progress * STORY.length));

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* The 3D scene stays fixed behind the first two screens. */}
      <Hero3D scrollFusion className="pointer-events-none fixed inset-0 h-full w-full" />

      <header className="fixed inset-x-0 top-0 z-30">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight text-ink">CreatorAI</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1">
            <Link to="/login" className="hidden sm:block">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/register">
              <Button size="sm">Get started</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* 1 — Hero */}
      <section className="relative flex min-h-[100svh] items-end">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 pb-14 sm:px-8 md:grid-cols-[1fr_auto] md:items-end md:pb-20">
          <h1 className="animate-fade-up text-[clamp(3rem,9vw,7.5rem)] font-semibold leading-[0.9] tracking-[-0.045em] text-ink">
            Upload once.
            <br />
            <span className="neon-text tracking-[-0.02em]">Create everywhere.</span>
          </h1>
          <div className="max-w-xs animate-fade-up md:pb-3">
            <p className="text-[15px] leading-relaxed text-ink-muted">
              A multimodal studio that reads your media and writes what comes next.
            </p>
            <Link to="/register" className="mt-5 inline-block">
              <Button>
                Start creating <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
        <span className="absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-[11px] text-ink-faint">
          scroll
        </span>
      </section>

      {/* 2 — Scroll story: the bodies fuse while three lines play */}
      <section ref={story.ref} className="relative h-[300vh]">
        <div className="sticky top-0 flex h-screen items-center">
          <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
            <div className="relative h-40">
              {STORY.map((s, i) => (
                <div
                  key={s.lead}
                  className="absolute inset-0 transition-all duration-500 ease-out"
                  style={{
                    opacity: i === active ? 1 : 0,
                    transform: `translateY(${(i - active) * 24}px)`,
                  }}
                >
                  <p className="text-[clamp(2rem,5vw,4rem)] font-semibold leading-none tracking-[-0.035em] text-ink">
                    {s.lead}
                  </p>
                  <p className="mt-4 text-lg text-ink-muted">{s.tail}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 flex gap-1.5">
              {STORY.map((s, i) => (
                <span
                  key={s.lead}
                  className={`h-0.5 w-8 rounded-full transition-colors ${i <= active ? 'bg-brand' : 'bg-line'}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3 — What you get */}
      <section className="relative z-10 border-t border-line bg-surface-0">
        <div className="mx-auto grid max-w-6xl gap-px px-5 py-24 sm:px-8 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.n} className="py-6 md:pr-10">
              <span className="font-mono text-xs text-brand">{f.n}</span>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-ink">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{f.body}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 border-t border-line px-5 py-24 sm:px-8 md:flex-row md:items-end md:justify-between">
          <h2 className="text-[clamp(2.25rem,5vw,4rem)] font-semibold leading-none tracking-[-0.04em] text-ink">
            Start with <span className="neon-text">one upload.</span>
          </h2>
          <Link to="/register">
            <Button size="lg">
              Create free account <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 text-xs text-ink-faint sm:px-8">
            <span>CreatorAI · Dev Crew</span>
            <span className="font-mono">video · audio · image · docs</span>
          </div>
        </footer>
      </section>
    </div>
  );
}

export function Logo({ small }: { small?: boolean }) {
  const size = small ? 'h-6 w-6' : 'h-7 w-7';
  return (
    <span className={`${size} grid place-items-center rounded-md bg-ink`}>
      <span className={`${small ? 'h-2 w-2' : 'h-2.5 w-2.5'} rounded-full bg-brand`} />
    </span>
  );
}
