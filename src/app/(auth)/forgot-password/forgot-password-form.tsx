'use client';

import { useState } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { authClient } from '@/lib/auth-client';

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' }).catch(() => undefined);

    // Always report the same outcome. Telling a stranger whether an address is
    // registered is an account-enumeration hole.
    setSubmitted(true);
    setPending(false);
  }

  if (submitted) {
    return (
      <Alert tone="success" title="Check your inbox">
        If an account exists for that address, a reset link is on its way. It expires in one hour and
        can be used once. Check your spam folder if it has not arrived in a few minutes.
      </Alert>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Email address" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" autoFocus required />
      </Field>
      <Button type="submit" variant="primary" full disabled={pending}>
        {pending ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
