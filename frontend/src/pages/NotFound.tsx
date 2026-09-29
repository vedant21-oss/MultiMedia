import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-brand to-accent">
        <Sparkles className="h-6 w-6 text-white" strokeWidth={2.5} />
      </div>
      <div>
        <h1 className="text-3xl font-bold text-ink">404</h1>
        <p className="mt-1.5 text-sm text-ink-muted">Nothing lives at this address.</p>
      </div>
      <Link to="/app">
        <Button>Back to your dashboard</Button>
      </Link>
    </div>
  );
}
