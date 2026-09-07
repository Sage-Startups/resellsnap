'use server';

import { revalidatePath } from 'next/cache';
import { sanitizeError } from '@/lib/logger';
import { isStripeConfigured } from '@/lib/env';
import { requireApiWorkspace } from '@/server/session';
import { createCheckoutSession, createPortalSession, verifyCheckoutSession } from './service';

export interface BillingActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

export async function startCheckoutAction(planKey: string): Promise<BillingActionResult<{ url: string }>> {
  try {
    if (!isStripeConfigured()) {
      return {
        ok: false,
        error: 'Billing is not configured on this deployment yet. Contact support to upgrade.',
      };
    }
    const context = await requireApiWorkspace();
    const { url } = await createCheckoutSession({ workspaceId: context.workspace.id, planKey });
    return { ok: true, data: { url } };
  } catch (error) {
    return { ok: false, error: sanitizeError(error, 'Could not start checkout.') };
  }
}

export async function openBillingPortalAction(): Promise<BillingActionResult<{ url: string }>> {
  try {
    if (!isStripeConfigured()) {
      return { ok: false, error: 'Billing is not configured on this deployment yet.' };
    }
    const context = await requireApiWorkspace();
    const { url } = await createPortalSession(context.workspace.id);
    return { ok: true, data: { url } };
  } catch (error) {
    return { ok: false, error: sanitizeError(error, 'Could not open the billing portal.') };
  }
}

/** Confirms a checkout with Stripe rather than trusting the redirect URL. */
export async function confirmCheckoutAction(
  sessionId: string,
): Promise<BillingActionResult<{ paid: boolean; planName: string | null; credits: number }>> {
  try {
    const context = await requireApiWorkspace();
    const result = await verifyCheckoutSession(context.workspace.id, sessionId);
    revalidatePath('/app/billing');
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: sanitizeError(error, 'Could not verify that payment.') };
  }
}
