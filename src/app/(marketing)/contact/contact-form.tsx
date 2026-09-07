'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { submitContactForm, type ContactState } from './actions';

const INITIAL: ContactState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending} className="sm:w-auto" full>
      {pending ? 'Sending…' : 'Send message'}
    </Button>
  );
}

export function ContactForm() {
  const [state, formAction] = useActionState(submitContactForm, INITIAL);

  if (state.status === 'success') {
    return (
      <Alert tone="success" title="Message sent">
        {state.message}
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.status === 'error' && state.message ? (
        <Alert tone="danger">{state.message}</Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="name" required error={state.fieldErrors?.name}>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            required
            aria-invalid={Boolean(state.fieldErrors?.name)}
          />
        </Field>

        <Field label="Email address" htmlFor="email" required error={state.fieldErrors?.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={Boolean(state.fieldErrors?.email)}
          />
        </Field>
      </div>

      <Field label="What is this about?" htmlFor="topic" required>
        <Select id="topic" name="topic" defaultValue="support" required>
          <option value="support">Using the product</option>
          <option value="billing">Billing or credits</option>
          <option value="integration">Marketplace connections</option>
          <option value="privacy">Privacy or data</option>
          <option value="other">Something else</option>
        </Select>
      </Field>

      <Field
        label="Message"
        htmlFor="message"
        required
        hint="The more specific you are, the faster we can help."
        error={state.fieldErrors?.message}
      >
        <Textarea
          id="message"
          name="message"
          rows={6}
          required
          minLength={20}
          aria-invalid={Boolean(state.fieldErrors?.message)}
        />
      </Field>

      {/* Honeypot — hidden from people, irresistible to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px]">
        <label htmlFor="website">Do not fill this in</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <SubmitButton />
    </form>
  );
}
