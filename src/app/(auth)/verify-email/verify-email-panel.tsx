'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { authClient } from '@/lib/auth-client';

export function VerifyEmailPanel({
  email,
  verified,
}: {
  email: string | null;
  verified: boolean;
}) {
  const params = useSearchParams();
  const failed = params.get('error');

  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  if (verified) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="You are verified">
          Your email address is confirmed and your account is active.
        </Alert>
        <Button asChild variant="primary" full>
          <Link href="/app">Go to my dashboard</Link>
        </Button>
      </div>
    );
  }

  async function resend(address: string) {
    setPending(true);
    await authClient.sendVerificationEmail({ email: address, callbackURL: '/app' }).catch(() => undefined);
    setSent(true);
    setPending(false);
  }

  return (
    <div className="space-y-4">
      {failed ? (
        <Alert tone="danger">
          That confirmation link has expired or was already used. Request a fresh one below.
        </Alert>
      ) : (
        <Alert tone="neutral">
          {email ? (
            <>
              We sent a confirmation link to <strong>{email}</strong>. Click it to finish setting up
              your account.
            </>
          ) : (
            'Enter your email address and we will send a fresh confirmation link.'
          )}
        </Alert>
      )}

      {sent ? <Alert tone="success">A new link is on its way. It expires in one hour.</Alert> : null}

      {email ? (
        <Button variant="outline" full disabled={pending} onClick={() => resend(email)}>
          {pending ? 'Sending…' : 'Resend the confirmation link'}
        </Button>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const value = String(new FormData(event.currentTarget).get('email') ?? '').trim();
            if (value) void resend(value);
          }}
        >
          <Field label="Email address" htmlFor="email" required>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Button type="submit" variant="primary" full disabled={pending}>
            {pending ? 'Sending…' : 'Send confirmation link'}
          </Button>
        </form>
      )}

      <p className="text-center text-[12px] leading-relaxed text-muted">
        Nothing in your inbox? Check spam, and make sure your address is spelled correctly.
      </p>
    </div>
  );
}
