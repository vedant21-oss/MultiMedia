import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage, fieldErrors } from '@/services/api';
import { Button, Input } from '@/components/ui';
import { AuthShell } from './Login';

const schema = z.object({
  full_name: z.string().trim().min(2, 'Tell us your name'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/\d/, 'Must contain a number')
    .regex(/[a-zA-Z]/, 'Must contain a letter'),
});

type Values = z.infer<typeof schema>;

export default function Register() {
  const [banner, setBanner] = useState('');
  const { register: signUp } = useAuth();
  const navigate = useNavigate();

  const {
    register, handleSubmit, setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setBanner('');
    try {
      await signUp(values.full_name, values.email, values.password);
      navigate('/app', { replace: true });
    } catch (err) {
      const fields = fieldErrors(err);
      for (const [key, message] of Object.entries(fields)) {
        if (key === 'email' || key === 'password' || key === 'full_name') {
          setError(key as keyof Values, { message });
        }
      }
      setBanner(errorMessage(err, 'Could not create your account'));
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Start turning uploads into content.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {banner && (
          <div className="flex gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="text-sm text-danger">{banner}</p>
          </div>
        )}

        <Input
          id="full_name"
          label="Name"
          autoComplete="name"
          error={errors.full_name?.message}
          {...register('full_name')}
        />
        <Input
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          hint="Reserved test domains like .test or .local are rejected."
          {...register('email')}
        />
        <Input
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          hint="At least 8 characters, with a letter and a number."
          {...register('password')}
        />

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
