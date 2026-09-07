/**
 * Transactional email content.
 *
 * Definitions here are the fallback and the seed source. Admins can override
 * subject and body per template in the database; the send path prefers the
 * database row when one exists and is active.
 */

export const EMAIL_KEYS = {
  VERIFY_EMAIL: 'verify_email',
  RESET_PASSWORD: 'reset_password',
  WELCOME: 'welcome',
  GENERATION_COMPLETE: 'generation_complete',
  GENERATION_FAILED: 'generation_failed',
  LOW_CREDITS: 'low_credits',
  PURCHASE_CONFIRMATION: 'purchase_confirmation',
  PAYMENT_FAILED: 'payment_failed',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  CONNECTION_EXPIRED: 'connection_expired',
  ACCOUNT_DELETION_REQUESTED: 'account_deletion_requested',
  ACCOUNT_DELETION_COMPLETED: 'account_deletion_completed',
} as const;

export type EmailKey = (typeof EMAIL_KEYS)[keyof typeof EMAIL_KEYS];

export interface EmailDefinition {
  key: EmailKey;
  name: string;
  subject: string;
  /** Markdown-ish body: blank-line separated paragraphs, `[label](url)` links. */
  body: string;
  /** Essential mail ignores notification preferences (security and billing). */
  isEssential: boolean;
  /** Tokens available to this template, used by the admin preview. */
  tokens: string[];
}

export const EMAIL_DEFINITIONS: EmailDefinition[] = [
  {
    key: EMAIL_KEYS.VERIFY_EMAIL,
    name: 'Verify email address',
    subject: 'Confirm your {{brandName}} email address',
    body: `Hi {{name}},

Thanks for creating a {{brandName}} account. Confirm your email address to start turning item photos into listings.

[Confirm my email]({{actionUrl}})

This link expires in 1 hour. If you did not create an account, you can safely ignore this message.`,
    isEssential: true,
    tokens: ['name', 'actionUrl', 'brandName'],
  },
  {
    key: EMAIL_KEYS.RESET_PASSWORD,
    name: 'Reset password',
    subject: 'Reset your {{brandName}} password',
    body: `Hi {{name}},

We received a request to reset the password for this account.

[Choose a new password]({{actionUrl}})

This link expires in 1 hour and can be used once. If you did not request a reset, no action is needed — your password has not changed.`,
    isEssential: true,
    tokens: ['name', 'actionUrl', 'brandName'],
  },
  {
    key: EMAIL_KEYS.WELCOME,
    name: 'Welcome / onboarding',
    subject: 'Welcome to {{brandName}} — snap it, list it, sell it',
    body: `Hi {{name}},

Your account is ready. Here is the fastest path to your first listing:

1. Photograph your item from a few angles — front, back, label and any flaws.
2. Confirm the details only you can know: size, defects, what is included.
3. Review the generated eBay, Vinted, Depop and Facebook Marketplace drafts, edit anything, then publish or export.

You have {{credits}} listing credits to start with.

[Create my first listing]({{actionUrl}})

Every draft is yours to edit before it goes anywhere. You stay responsible for the accuracy of what you publish.`,
    isEssential: false,
    tokens: ['name', 'actionUrl', 'credits', 'brandName'],
  },
  {
    key: EMAIL_KEYS.GENERATION_COMPLETE,
    name: 'Listing generation completed',
    subject: 'Your listing drafts for {{itemTitle}} are ready',
    body: `Hi {{name}},

We finished analysing {{itemTitle}}. Your master listing and four platform drafts are waiting for review.

[Review the drafts]({{actionUrl}})

Check anything marked as needing confirmation before you publish — those are inferences, not facts.`,
    isEssential: false,
    tokens: ['name', 'itemTitle', 'actionUrl', 'brandName'],
  },
  {
    key: EMAIL_KEYS.GENERATION_FAILED,
    name: 'Listing generation failed',
    subject: "We couldn't finish the listing for {{itemTitle}}",
    body: `Hi {{name}},

Generation for {{itemTitle}} did not complete after several attempts, so we have returned the listing credit to your balance.

Reason: {{reason}}

[Open the item and retry]({{actionUrl}})

If this keeps happening, reply to this email and we will look into it.`,
    isEssential: false,
    tokens: ['name', 'itemTitle', 'reason', 'actionUrl', 'brandName'],
  },
  {
    key: EMAIL_KEYS.LOW_CREDITS,
    name: 'Low credits',
    subject: 'You have {{credits}} listing credits left',
    body: `Hi {{name}},

Your {{brandName}} balance is down to {{credits}} listing credits.

[Top up or change plan]({{actionUrl}})

Editing and copying existing drafts is always free — credits are only used for a new analysis and generation.`,
    isEssential: false,
    tokens: ['name', 'credits', 'actionUrl', 'brandName'],
  },
  {
    key: EMAIL_KEYS.PURCHASE_CONFIRMATION,
    name: 'Purchase confirmation',
    subject: 'Your {{brandName}} purchase is confirmed',
    body: `Hi {{name}},

Thanks — your purchase of {{planName}} is confirmed and {{credits}} listing credits have been added to your balance.

[View billing and invoices]({{actionUrl}})

Stripe holds the record of the charge; your invoice is available in the billing portal.`,
    isEssential: true,
    tokens: ['name', 'planName', 'credits', 'actionUrl', 'brandName'],
  },
  {
    key: EMAIL_KEYS.PAYMENT_FAILED,
    name: 'Payment failed',
    subject: 'Action needed: your {{brandName}} payment failed',
    body: `Hi {{name}},

We could not take payment for your {{brandName}} subscription. Your existing credits remain available, but the plan will not renew until the payment succeeds.

[Update your payment method]({{actionUrl}})`,
    isEssential: true,
    tokens: ['name', 'actionUrl', 'brandName'],
  },
  {
    key: EMAIL_KEYS.SUBSCRIPTION_CANCELLED,
    name: 'Subscription cancelled or ending',
    subject: 'Your {{brandName}} plan ends on {{endDate}}',
    body: `Hi {{name}},

Your {{planName}} plan is set to end on {{endDate}}. Until then everything keeps working as normal.

After that date your monthly credits stop renewing. Any credits you purchased separately stay in your account, and your listings, photos and history remain accessible.

[Reactivate or change plan]({{actionUrl}})`,
    isEssential: true,
    tokens: ['name', 'planName', 'endDate', 'actionUrl', 'brandName'],
  },
  {
    key: EMAIL_KEYS.CONNECTION_EXPIRED,
    name: 'Marketplace connection expired',
    subject: 'Reconnect your {{platformName}} account',
    body: `Hi {{name}},

Your {{platformName}} connection needs re-authorisation. Until you reconnect, publishing to {{platformName}} is paused — exports and every other platform are unaffected.

[Reconnect {{platformName}}]({{actionUrl}})`,
    isEssential: true,
    tokens: ['name', 'platformName', 'actionUrl', 'brandName'],
  },
  {
    key: EMAIL_KEYS.ACCOUNT_DELETION_REQUESTED,
    name: 'Account deletion requested',
    subject: 'We received your {{brandName}} deletion request',
    body: `Hi {{name}},

We have recorded your request to delete this account. Your data will be removed after a {{retentionDays}}-day grace period, during which you can cancel by signing in.

[Cancel the deletion request]({{actionUrl}})`,
    isEssential: true,
    tokens: ['name', 'retentionDays', 'actionUrl', 'brandName'],
  },
  {
    key: EMAIL_KEYS.ACCOUNT_DELETION_COMPLETED,
    name: 'Account deletion completed',
    subject: 'Your {{brandName}} account has been deleted',
    body: `Hi {{name}},

Your {{brandName}} account, listings and uploaded photos have been permanently deleted.

Billing records are retained only where required by law. Thank you for trying {{brandName}}.`,
    isEssential: true,
    tokens: ['name', 'brandName'],
  },
];

export function findEmailDefinition(key: string): EmailDefinition | undefined {
  return EMAIL_DEFINITIONS.find((definition) => definition.key === key);
}
