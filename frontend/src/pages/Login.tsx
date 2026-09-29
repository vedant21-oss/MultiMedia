import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle } from 'lucide-react';
import { Hero3D } from '@/components/Hero3D';
import { Logo } from './Landing';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage, fieldErrors } from '@/services/api';
import { Button, Input } from '@/components/ui';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type Values = z.infer<typeof schema>;

export default function Login() {
  const [banner, setBanner] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const {
    register, handleSubmit, setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setBanner('');
    try {
      await login(values.email, values.password);
      navigate('/app', { replace: true });
    } catch (err) {
      const fields = fieldErrors(err);
      for (const [key, message] of Object.entries(fields)) {
        if (key === 'email' || key === 'password') setError(key, { message });
      }
      setBanner(errorMessage(err, 'Could not sign in'));
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your content studio.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {banner && (
          <div className="flex gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="text-sm text-danger">{banner}</p>
          </div>
        )}

        <Input
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        No account yet?{' '}
        <Link to="/register" className="font-semibold text-brand hover:underline">
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({
  title, subtitle, children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <Hero3D className="pointer-events-none absolute left-1/2 top-1/2 h-[820px] w-[820px] -translate-x-1/2 -translate-y-1/2 opacity-40" />
      <div className="relative w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
          <Logo />
          <span className="text-lg font-extrabold tracking-tight text-ink">
            Creator<span className="text-brand">AI</span>
          </span>
        </Link>

        <div className="card animate-fade-up p-6">
          <h1 className="text-xl font-bold text-ink">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-ink-muted">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
