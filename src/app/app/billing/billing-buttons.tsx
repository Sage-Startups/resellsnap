'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button } from '@/components/ui';
import {
  confirmCheckoutAction,
  openBillingPortalAction,
  startCheckoutAction,
} from '@/server/billing/actions';

export function CheckoutButton({
  planKey,
  label,
  variant = 'outline',
  disabled,
  full,
}: {
  planKey: string;
  label: string;
  variant?: 'primary' | 'outline' | 'ink';
  disabled?: boolean;
  full?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        variant={variant}
        full={full}
        disabled={pending || disabled}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await startCheckoutAction(planKey);
          if (result.ok && result.data) {
            window.location.href = result.data.url;
          } else {
            setError(result.error ?? 'Could not start checkout.');
            setPending(false);
          }
        }}
      >
        {pending ? 'Opening checkout…' : label}
      </Button>
      {error ? <p className="mt-1.5 text-[12px] text-danger">{error}</p> : null}
    </>
  );
}

export function PortalButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        variant="outline"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await openBillingPortalAction();
          if (result.ok && result.data) {
            window.location.href = result.data.url;
          } else {
            setError(result.error ?? 'Could not open the portal.');
            setPending(false);
          }
        }}
      >
        {pending ? 'Opening…' : 'Manage payment and invoices'}
      </Button>
      {error ? <p className="mt-1.5 text-[12px] text-danger">{error}</p> : null}
    </>
  );
}

/**
 * Confirms a checkout with Stripe on arrival.
 *
 * The `?session_id=` in the URL is only a pointer — the server asks Stripe
 * whether the session was actually paid before showing a success message.
 */
export function CheckoutResult() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get('session_id');
  const cancelled = params.get('checkout') === 'cancelled';

  const [state, setState] = useState<{
    status: 'idle' | 'checking' | 'paid' | 'unpaid';
    planName?: string | null;
    credits?: number;
  }>({ status: sessionId ? 'checking' : 'idle' });

  useEffect(() => {
    if (!sessionId) return;
    let active = true;

    void (async () => {
      const result = await confirmCheckoutAction(sessionId);
      if (!active) return;

      if (result.ok && result.data?.paid) {
        setState({ status: 'paid', planName: result.data.planName, credits: result.data.credits });
        router.refresh();
      } else {
        setState({ status: 'unpaid' });
      }
    })();

    return () => {
      active = false;
    };
  }, [sessionId, router]);

  if (cancelled) {
    return (
      <Alert tone="neutral">
        Checkout was cancelled. Nothing has been charged and your plan is unchanged.
      </Alert>
    );
  }

  if (state.status === 'checking') {
    return <Alert tone="neutral">Confirming your payment with Stripe…</Alert>;
  }

  if (state.status === 'paid') {
    return (
      <Alert tone="success" title="Payment confirmed">
        {state.planName ? `${state.planName} is active. ` : ''}
        {state.credits ? `${state.credits} listing credits have been added to your balance.` : ''}
      </Alert>
    );
  }

  if (state.status === 'unpaid') {
    return (
      <Alert tone="warning" title="We could not confirm that payment">
        Stripe has not reported this session as paid. If you were charged, it will appear here
        within a minute — refresh the page, and contact support if it does not.
      </Alert>
    );
  }

  return null;
}
