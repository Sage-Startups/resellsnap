'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { authClient } from '@/lib/auth-client';

const MIN_PASSWORD_LENGTH = 10;

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <Alert tone="danger" title="This link is not valid">
        The reset link is missing or malformed.{' '}
        <Link href="/forgot-password" className="underline underline-offset-4">
          Request a new one
        </Link>
        .
      </Alert>
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get('password') ?? '');
    const confirm = String(formData.get('confirm') ?? '');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Those passwords do not match.');
      return;
    }

    setPending(true);
    const { error: resetError } = await authClient.resetPassword({
      newPassword: password,
      token: token as string,
    });

    if (resetError) {
      setError('That link has expired or has already been used. Please request a new one.');
      setPending(false);
      return;
    }

    setDone(true);
    setPending(false);
    setTimeout(() => router.push('/login'), 2500);
  }

  if (done) {
    return (
      <Alert tone="success" title="Password updated">
        You can now sign in with your new password. Taking you to the sign-in page…
      </Alert>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Field
        label="New password"
        htmlFor="password"
        required
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          autoFocus
          required
        />
      </Field>

      <Field label="Confirm new password" htmlFor="confirm" required>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </Field>

      <Button type="submit" variant="primary" full disabled={pending}>
        {pending ? 'Updating…' : 'Update password'}
      </Button>
    </form>
  );
}
