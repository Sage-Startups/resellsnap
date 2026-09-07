'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Checkbox, Field, Input } from '@/components/ui';
import { authClient } from '@/lib/auth-client';

const ERROR_COPY: Record<string, string> = {
  suspended: 'This account has been suspended. Contact support if you think that is a mistake.',
  session_expired: 'Your session expired. Please sign in again.',
};

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get('redirectTo') ?? '/app';

  const [error, setError] = useState<string | null>(ERROR_COPY[params.get('error') ?? ''] ?? null);
  const [pending, setPending] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNeedsVerification(false);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
      rememberMe: formData.get('remember') === 'on',
    });

    if (signInError) {
      // Better Auth returns a distinct status when verification is outstanding;
      // that deserves a different next step, not a generic failure.
      if (signInError.status === 403) {
        setNeedsVerification(true);
        setError('Confirm your email address before signing in. We have sent you a fresh link.');
        await authClient.sendVerificationEmail({ email, callbackURL: '/app' }).catch(() => undefined);
      } else {
        setError('That email and password combination did not work. Please try again.');
      }
      setPending(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? (
        <Alert tone={needsVerification ? 'warning' : 'danger'}>{error}</Alert>
      ) : null}

      <Field label="Email address" htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          aria-invalid={Boolean(error)}
        />
      </Field>

      <div>
        <Field label="Password" htmlFor="password" required>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(error)}
          />
        </Field>
        <div className="mt-2 flex items-center justify-between">
          <label className="flex items-center gap-2 text-[13px] text-muted">
            <Checkbox name="remember" defaultChecked />
            Keep me signed in
          </label>
          <Link
            href="/forgot-password"
            className="text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </div>

      <Button type="submit" variant="primary" full disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
