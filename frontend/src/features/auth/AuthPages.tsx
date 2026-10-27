import { useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ForgotPasswordSchema, LoginSchema, RegisterSchema } from '@cyberlearn/shared';
import { ShieldCheck } from 'lucide-react';
import { api, ApiError, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { Alert, PageLoader } from '../../components/ui/Feedback';
import type { User } from '../../types/models';
import { useAuth } from './AuthContext';

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="min-h-full flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.12),transparent_60%)]">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-8">
          <ShieldCheck className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold tracking-tight">
            CyberLearn <span className="text-primary">AI</span>
          </span>
        </div>
        <div className="rounded-2xl border border-border bg-surface/90 p-6 sm:p-8 shadow-2xl shadow-black/30">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-muted text-sm mt-1 mb-6">{subtitle}</p>
          {children}
        </div>
        <div className="text-center text-sm text-muted mt-6">{footer}</div>
      </div>
    </div>
  );
}

function useRedirectIfAuthed() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  return { user, loading, from };
}

export function LoginPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const { user, loading, from } = useRedirectIfAuthed();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof LoginSchema>>({ resolver: zodResolver(LoginSchema) });

  if (loading) return <PageLoader />;
  if (user) return <Navigate to={from} replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await api.post<{ user: User }>('/auth/login', values);
      setUser(res.user);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue learning."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Email" type="email" autoComplete="email" {...form.register('email')} error={form.formState.errors.email?.message} />
        <Input label="Password" type="password" autoComplete="current-password" {...form.register('password')} error={form.formState.errors.password?.message} />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-muted hover:text-primary">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const { user, loading } = useRedirectIfAuthed();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof RegisterSchema>>({ resolver: zodResolver(RegisterSchema) });

  if (loading) return <PageLoader />;
  if (user) return <Navigate to="/" replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await api.post<{ user: User }>('/auth/register', values);
      setUser(res.user);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        for (const [field, messages] of Object.entries(err.fieldErrors)) {
          form.setError(field as keyof z.input<typeof RegisterSchema>, { message: messages[0] });
        }
      }
      setError(errorMessage(err));
    }
  });

  return (
    <AuthShell
      title="Create your account"
      subtitle="Turn any study material into an interactive lesson."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Display name" autoComplete="nickname" {...form.register('displayName')} error={form.formState.errors.displayName?.message} />
        <Input label="Email" type="email" autoComplete="email" {...form.register('email')} error={form.formState.errors.email?.message} />
        <Input
          label="Password"
          hint="at least 10 characters"
          type="password"
          autoComplete="new-password"
          {...form.register('password')}
          error={form.formState.errors.password?.message}
        />
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [result, setResult] = useState<{ message: string; devResetUrl?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof ForgotPasswordSchema>>({ resolver: zodResolver(ForgotPasswordSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      setResult(await api.post('/auth/forgot-password', values));
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  return (
    <AuthShell title="Reset your password" subtitle="Enter your email to receive a reset link." footer={<Link to="/login" className="text-primary hover:underline">Back to sign in</Link>}>
      {result ? (
        <div className="space-y-3">
          <Alert tone="success">{result.message}</Alert>
          {result.devResetUrl && (
            <Alert tone="info" title="Development mode">
              No email service is configured, so here is the link:{' '}
              <a className="text-primary underline break-all" href={result.devResetUrl}>
                open reset page
              </a>
            </Alert>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <Input label="Email" type="email" autoComplete="email" {...form.register('email')} error={form.formState.errors.email?.message} />
          <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

const ResetForm = z.object({ password: z.string().min(10, 'Use at least 10 characters').max(200) });

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof ResetForm>>({ resolver: zodResolver(ResetForm) });

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setError(null);
    try {
      const res = await api.post<{ user: User }>('/auth/reset-password', { token, password });
      setUser(res.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  return (
    <AuthShell title="Choose a new password" subtitle="Other sessions will be signed out." footer={<Link to="/login" className="text-primary hover:underline">Back to sign in</Link>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {!token && <Alert tone="error">This reset link is missing its token.</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="New password" type="password" autoComplete="new-password" {...form.register('password')} error={form.formState.errors.password?.message} />
        <Button type="submit" className="w-full" disabled={!token} loading={form.formState.isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
