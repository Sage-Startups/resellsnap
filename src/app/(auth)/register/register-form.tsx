'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { authClient } from '@/lib/auth-client';

const MIN_PASSWORD_LENGTH = 10;

/** Cheap, honest strength feedback — length first, because length is what matters. */
function passwordStrength(value: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (value.length < MIN_PASSWORD_LENGTH) return { score: 0, label: 'Too short' };
  let score = 1;
  if (value.length >= 14) score += 1;
  if (/[^A-Za-z0-9]/.test(value) && /\d/.test(value)) score += 1;
  const labels = ['Too short', 'Okay', 'Good', 'Strong'] as const;
  const capped = Math.min(3, score) as 0 | 1 | 2 | 3;
  return { score: capped, label: labels[capped] };
}

export function RegisterForm() {
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [password, setPassword] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  const strength = passwordStrength(password);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError({});

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get('name') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim();
    const value = String(formData.get('password') ?? '');

    if (!name) {
      setFieldError({ name: 'Please tell us what to call you.' });
      return;
    }
    if (value.length < MIN_PASSWORD_LENGTH) {
      setFieldError({ password: `Use at least ${MIN_PASSWORD_LENGTH} characters.` });
      return;
    }
    if (formData.get('terms') !== 'on') {
      setError('Please accept the terms and privacy policy to continue.');
      return;
    }

    setPending(true);
    const { error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password: value,
      callbackURL: '/app',
    });

    if (signUpError) {
      setError(
        signUpError.status === 422
          ? 'An account already exists for that email address. Try signing in instead.'
          : 'We could not create that account. Please check your details and try again.',
      );
      setPending(false);
      return;
    }

    setSentTo(email);
    setPending(false);
  }

  if (sentTo) {
    return (
      <Alert tone="success" title="Check your email">
        We have sent a confirmation link to <strong>{sentTo}</strong>. Click it to activate your
        account and claim your three free listing credits. The link expires in one hour.
      </Alert>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Field label="Your name" htmlFor="name" required error={fieldError.name}>
        <Input id="name" name="name" autoComplete="name" autoFocus required />
      </Field>

      <Field label="Email address" htmlFor="email" required error={fieldError.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        required
        hint={`At least ${MIN_PASSWORD_LENGTH} characters. A short phrase you will remember beats a scrambled word.`}
        error={fieldError.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      {password.length > 0 ? (
        <div className="flex items-center gap-2" aria-live="polite">
          <div className="flex flex-1 gap-1" aria-hidden="true">
            {[1, 2, 3].map((step) => (
              <span
                key={step}
                className={`h-1 flex-1 rounded-full ${
                  strength.score >= step ? 'bg-lime-deep' : 'bg-stone-200'
                }`}
              />
            ))}
          </div>
          <span className="text-[12px] text-muted">{strength.label}</span>
        </div>
      ) : null}

      <label className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted">
        <input
          type="checkbox"
          name="terms"
          required
          className="mt-0.5 size-4 shrink-0 rounded border-stone-300 accent-ink"
        />
        <span>
          I agree to the{' '}
          <Link href="/legal/terms" className="text-ink underline underline-offset-4">
            terms of service
          </Link>{' '}
          and{' '}
          <Link href="/legal/privacy" className="text-ink underline underline-offset-4">
            privacy policy
          </Link>
          .
        </span>
      </label>

      <Button type="submit" variant="primary" full disabled={pending}>
        {pending ? 'Creating your account…' : 'Create account'}
      </Button>
    </form>
  );
}
