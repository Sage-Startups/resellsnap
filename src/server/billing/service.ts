/**
 * Billing service.
 *
 * Checkout, the customer portal, and the webhook handlers that keep our
 * subscription mirror and the credit ledger in step with Stripe.
 */
import type Stripe from 'stripe';
import {
  CreditBucket,
  CreditEntryKind,
  PlanKind,
  SubscriptionStatus,
  WebhookStatus,
} from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { logger, sanitizeError } from '@/lib/logger';
import { grantCredits, resetMonthlyCredits } from '@/server/credits';
import { EMAIL_KEYS, sendTemplateEmail } from '@/server/email';
import { getStripe } from './stripe';

/** Stripe statuses mapped onto our own enum. */
const STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: SubscriptionStatus.TRIALING,
  active: SubscriptionStatus.ACTIVE,
  past_due: SubscriptionStatus.PAST_DUE,
  canceled: SubscriptionStatus.CANCELED,
  unpaid: SubscriptionStatus.UNPAID,
  incomplete: SubscriptionStatus.INCOMPLETE,
  incomplete_expired: SubscriptionStatus.INCOMPLETE_EXPIRED,
  paused: SubscriptionStatus.PAUSED,
};

function mapStatus(status: string): SubscriptionStatus {
  return STATUS_MAP[status] ?? SubscriptionStatus.NONE;
}

async function ensureCustomer(workspaceId: string): Promise<string> {
  const subscription = await prisma.subscription.findUnique({
    where: { workspaceId },
    include: {
      workspace: {
        select: {
          name: true,
          members: {
            where: { role: 'OWNER' },
            take: 1,
            select: { user: { select: { email: true, name: true } } },
          },
        },
      },
    },
  });

  if (subscription?.stripeCustomerId) return subscription.stripeCustomerId;

  const owner = subscription?.workspace.members[0]?.user;
  const customer = await getStripe().customers.create({
    email: owner?.email,
    name: subscription?.workspace.name,
    // The workspace id travels with every Stripe object, so a webhook can find
    // its way home even if our own ids are not in the event payload.
    metadata: { workspaceId },
  });

  await prisma.subscription.upsert({
    where: { workspaceId },
    create: { workspaceId, stripeCustomerId: customer.id, status: SubscriptionStatus.NONE },
    update: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

export interface CheckoutInput {
  workspaceId: string;
  planKey: string;
  successPath?: string;
  cancelPath?: string;
}

export async function createCheckoutSession(input: CheckoutInput): Promise<{ url: string }> {
  const plan = await prisma.plan.findUnique({ where: { key: input.planKey } });

  if (!plan || !plan.isVisible) throw new Error('That plan is not available.');
  if (plan.kind === PlanKind.FREE) throw new Error('The free plan does not require checkout.');
  if (!plan.stripePriceId) {
    throw new Error(
      `No Stripe Price ID is configured for "${plan.name}". An operator must set it before this plan can be purchased.`,
    );
  }

  const env = getEnv();
  const customerId = await ensureCustomer(input.workspaceId);
  const isSubscription = plan.kind === PlanKind.SUBSCRIPTION;

  const session = await getStripe().checkout.sessions.create({
    mode: isSubscription ? 'subscription' : 'payment',
    customer: customerId,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${env.APP_URL}${input.successPath ?? '/app/billing'}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.APP_URL}${input.cancelPath ?? '/app/billing'}?checkout=cancelled`,
    client_reference_id: input.workspaceId,
    metadata: { workspaceId: input.workspaceId, planKey: plan.key },
    ...(isSubscription
      ? { subscription_data: { metadata: { workspaceId: input.workspaceId, planKey: plan.key } } }
      : { payment_intent_data: { metadata: { workspaceId: input.workspaceId, planKey: plan.key } } }),
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    automatic_tax: { enabled: false },
  });

  await prisma.analyticsEvent.create({
    data: {
      name: 'CHECKOUT_STARTED',
      workspaceId: input.workspaceId,
      properties: { planKey: plan.key },
    },
  });

  if (!session.url) throw new Error('Stripe did not return a checkout URL.');
  return { url: session.url };
}

export async function createPortalSession(workspaceId: string): Promise<{ url: string }> {
  const customerId = await ensureCustomer(workspaceId);
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${getEnv().APP_URL}/app/billing`,
  });
  return { url: session.url };
}

/**
 * Verifies a completed checkout server-side.
 *
 * The success page calls this rather than trusting its own query string — a
 * `?success=true` in the URL proves nothing.
 */
export async function verifyCheckoutSession(
  workspaceId: string,
  sessionId: string,
): Promise<{ paid: boolean; planName: string | null; credits: number }> {
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);

    if (session.client_reference_id !== workspaceId) {
      logger.warn('Checkout session does not belong to this workspace', { sessionId });
      return { paid: false, planName: null, credits: 0 };
    }

    const paid = session.payment_status === 'paid' || session.status === 'complete';
    const planKey = session.metadata?.planKey;
    const plan = planKey ? await prisma.plan.findUnique({ where: { key: planKey } }) : null;

    return { paid, planName: plan?.name ?? null, credits: plan?.creditsGranted ?? 0 };
  } catch (error) {
    logger.warn('Could not verify checkout session', { error });
    return { paid: false, planName: null, credits: 0 };
  }
}

// --- Webhook handling ------------------------------------------------------

export const HANDLED_STRIPE_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
] as const;

export interface WebhookOutcome {
  status: WebhookStatus;
  detail: string;
}

/**
 * Processes one Stripe event, exactly once.
 *
 * Idempotency has two layers: a unique index on `StripeEvent.stripeEventId`
 * rejects a replayed delivery outright, and every credit grant carries its own
 * deterministic key so even a bug here cannot double-grant.
 */
export async function processStripeEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  const existing = await prisma.stripeEvent.findUnique({
    where: { stripeEventId: event.id },
  });

  if (existing?.status === WebhookStatus.PROCESSED) {
    return { status: WebhookStatus.PROCESSED, detail: 'Already processed' };
  }

  await prisma.stripeEvent.upsert({
    where: { stripeEventId: event.id },
    create: {
      stripeEventId: event.id,
      type: event.type,
      status: WebhookStatus.RECEIVED,
      payloadSummary: summarise(event) as never,
    },
    update: { status: WebhookStatus.RECEIVED },
  });

  await prisma.webhookEvent.upsert({
    where: { source_eventId: { source: 'STRIPE', eventId: event.id } },
    create: {
      source: 'STRIPE',
      eventId: event.id,
      eventType: event.type,
      status: WebhookStatus.RECEIVED,
      payloadSummary: summarise(event) as never,
    },
    update: { attempts: { increment: 1 } },
  });

  let outcome: WebhookOutcome;

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        outcome = await onCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        outcome = await onSubscriptionChanged(event.data.object);
        break;
      case 'customer.subscription.deleted':
        outcome = await onSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.paid':
        outcome = await onInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        outcome = await onPaymentFailed(event.data.object);
        break;
      default:
        outcome = { status: WebhookStatus.IGNORED, detail: `Unhandled type ${event.type}` };
    }
  } catch (error) {
    const detail = sanitizeError(error, 'Webhook handler failed');
    logger.error('Stripe webhook processing failed', { type: event.type, error });

    await markEvent(event.id, WebhookStatus.FAILED, detail);
    return { status: WebhookStatus.FAILED, detail };
  }

  await markEvent(event.id, outcome.status, outcome.detail);
  return outcome;
}

async function markEvent(eventId: string, status: WebhookStatus, detail: string): Promise<void> {
  const processedAt = status === WebhookStatus.PROCESSED ? new Date() : null;
  await Promise.all([
    prisma.stripeEvent.update({
      where: { stripeEventId: eventId },
      data: { status, processedAt, error: status === WebhookStatus.FAILED ? detail : null },
    }),
    prisma.webhookEvent.update({
      where: { source_eventId: { source: 'STRIPE', eventId } },
      data: { status, processedAt, error: status === WebhookStatus.FAILED ? detail : null },
    }),
  ]);
}

function summarise(event: Stripe.Event): Record<string, unknown> {
  const object = event.data.object as unknown as Record<string, unknown>;
  // Deliberately narrow: ids and states only. No card data, no addresses.
  return {
    id: object.id,
    object: object.object,
    status: object.status,
    amountTotal: object.amount_total,
    currency: object.currency,
    livemode: event.livemode,
  };
}

async function resolveWorkspaceId(
  metadata: Stripe.Metadata | null | undefined,
  customerId: string | null | undefined,
): Promise<string | null> {
  if (metadata?.workspaceId) return metadata.workspaceId;
  if (!customerId) return null;
  const subscription = await prisma.subscription.findUnique({
    where: { stripeCustomerId: customerId },
    select: { workspaceId: true },
  });
  return subscription?.workspaceId ?? null;
}

async function onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<WebhookOutcome> {
  const workspaceId =
    session.client_reference_id ??
    (await resolveWorkspaceId(session.metadata, session.customer as string | null));

  if (!workspaceId) {
    return { status: WebhookStatus.IGNORED, detail: 'No workspace on session' };
  }

  const planKey = session.metadata?.planKey;
  const plan = planKey ? await prisma.plan.findUnique({ where: { key: planKey } }) : null;

  if (!plan) return { status: WebhookStatus.IGNORED, detail: 'No plan on session' };

  // A credit pack grants immediately. A subscription's credits arrive with its
  // first `invoice.paid`, so they are not granted twice.
  if (plan.kind === PlanKind.CREDIT_PACK) {
    const result = await grantCredits({
      workspaceId,
      amount: plan.creditsGranted,
      bucket: CreditBucket.PURCHASED,
      kind: CreditEntryKind.PACK_PURCHASE,
      idempotencyKey: `pack:${session.id}`,
      reason: `${plan.name} purchase`,
    });

    await prisma.analyticsEvent.create({
      data: {
        name: 'CREDIT_PACK_PURCHASED',
        workspaceId,
        properties: { planKey: plan.key, credits: plan.creditsGranted },
      },
    });

    await notifyOwner(workspaceId, EMAIL_KEYS.PURCHASE_CONFIRMATION, {
      planName: plan.name,
      credits: plan.creditsGranted,
      actionUrl: `${getEnv().APP_URL}/app/billing`,
    });

    return {
      status: WebhookStatus.PROCESSED,
      detail: result.applied ? `Granted ${plan.creditsGranted} credits` : 'Already granted',
    };
  }

  if (session.subscription) {
    await prisma.subscription.update({
      where: { workspaceId },
      data: {
        planId: plan.id,
        stripeSubscriptionId: session.subscription as string,
        status: SubscriptionStatus.ACTIVE,
      },
    });

    await prisma.analyticsEvent.create({
      data: { name: 'SUBSCRIPTION_STARTED', workspaceId, properties: { planKey: plan.key } },
    });
  }

  return { status: WebhookStatus.PROCESSED, detail: 'Checkout recorded' };
}

async function onSubscriptionChanged(subscription: Stripe.Subscription): Promise<WebhookOutcome> {
  const workspaceId = await resolveWorkspaceId(
    subscription.metadata,
    subscription.customer as string,
  );
  if (!workspaceId) return { status: WebhookStatus.IGNORED, detail: 'No workspace' };

  const priceId = subscription.items.data[0]?.price.id;
  const plan = priceId ? await prisma.plan.findFirst({ where: { stripePriceId: priceId } }) : null;

  const item = subscription.items.data[0];
  const periodStart = item?.current_period_start
    ? new Date(item.current_period_start * 1000)
    : null;
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;

  await prisma.subscription.update({
    where: { workspaceId },
    data: {
      planId: plan?.id ?? undefined,
      stripeSubscriptionId: subscription.id,
      status: mapStatus(subscription.status),
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    },
  });

  if (subscription.cancel_at_period_end && periodEnd) {
    await notifyOwner(workspaceId, EMAIL_KEYS.SUBSCRIPTION_CANCELLED, {
      planName: plan?.name ?? 'your plan',
      endDate: periodEnd.toLocaleDateString('en-US', { dateStyle: 'long' }),
      actionUrl: `${getEnv().APP_URL}/app/billing`,
    });
  }

  return { status: WebhookStatus.PROCESSED, detail: `Subscription ${subscription.status}` };
}

async function onSubscriptionDeleted(subscription: Stripe.Subscription): Promise<WebhookOutcome> {
  const workspaceId = await resolveWorkspaceId(
    subscription.metadata,
    subscription.customer as string,
  );
  if (!workspaceId) return { status: WebhookStatus.IGNORED, detail: 'No workspace' };

  await prisma.subscription.update({
    where: { workspaceId },
    data: {
      status: SubscriptionStatus.CANCELED,
      endedAt: new Date(),
      cancelAtPeriodEnd: false,
      planId: null,
    },
  });

  // Monthly credits stop renewing, but purchased packs are untouched — the
  // seller paid for those separately.
  await prisma.workspace.update({ where: { id: workspaceId }, data: { monthlyCredits: 0 } });

  return { status: WebhookStatus.PROCESSED, detail: 'Subscription ended' };
}

async function onInvoicePaid(invoice: Stripe.Invoice): Promise<WebhookOutcome> {
  const workspaceId = await resolveWorkspaceId(invoice.metadata, invoice.customer as string);
  if (!workspaceId) return { status: WebhookStatus.IGNORED, detail: 'No workspace' };

  const line = invoice.lines.data[0];
  // The price reference moved between Stripe API versions; accept either shape
  // rather than depending on one and breaking on the next upgrade.
  const rawPrice = line?.pricing?.price_details?.price;
  const priceId = typeof rawPrice === 'string' ? rawPrice : (rawPrice as { id?: string })?.id;
  const plan = priceId ? await prisma.plan.findFirst({ where: { stripePriceId: priceId } }) : null;

  if (!plan || plan.kind !== PlanKind.SUBSCRIPTION) {
    return { status: WebhookStatus.IGNORED, detail: 'Not a subscription invoice' };
  }

  const periodStart = line?.period?.start
    ? new Date(line.period.start * 1000)
    : new Date(invoice.created * 1000);

  // Keyed on the period start, so a duplicate delivery cannot grant twice.
  const result = await resetMonthlyCredits({
    workspaceId,
    credits: plan.creditsGranted,
    periodStart,
    reason: `${plan.name} billing period`,
  });

  await prisma.subscription.update({
    where: { workspaceId },
    data: { status: SubscriptionStatus.ACTIVE, planId: plan.id },
  });

  return {
    status: WebhookStatus.PROCESSED,
    detail: result.applied ? `Reset to ${plan.creditsGranted} credits` : 'Already reset',
  };
}

async function onPaymentFailed(invoice: Stripe.Invoice): Promise<WebhookOutcome> {
  const workspaceId = await resolveWorkspaceId(invoice.metadata, invoice.customer as string);
  if (!workspaceId) return { status: WebhookStatus.IGNORED, detail: 'No workspace' };

  await prisma.subscription.update({
    where: { workspaceId },
    data: { status: SubscriptionStatus.PAST_DUE },
  });

  await notifyOwner(workspaceId, EMAIL_KEYS.PAYMENT_FAILED, {
    actionUrl: `${getEnv().APP_URL}/app/billing`,
  });

  return { status: WebhookStatus.PROCESSED, detail: 'Marked past due' };
}

async function notifyOwner(
  workspaceId: string,
  key: string,
  tokens: Record<string, string | number>,
): Promise<void> {
  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId, role: 'OWNER' },
    select: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!membership) return;

  await sendTemplateEmail({
    key: key as never,
    to: membership.user.email,
    userId: membership.user.id,
    tokens: { name: membership.user.name || 'there', ...tokens },
  });
}
