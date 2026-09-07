'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getSettings } from '@/server/settings';
import { getEmailProvider } from '@/server/email';
import { renderEmail } from '@/server/email/render';

const ContactSchema = z.object({
  name: z.string().trim().min(1, 'Please tell us your name.').max(120),
  email: z.string().trim().email('Enter a valid email address.').max(200),
  topic: z.enum(['support', 'billing', 'integration', 'privacy', 'other']),
  message: z
    .string()
    .trim()
    .min(20, 'Please give us a little more detail (at least 20 characters).')
    .max(4000),
  // Honeypot: a real person never fills this in.
  website: z.string().max(0).optional().or(z.literal('')),
});

export interface ContactState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  fieldErrors?: Record<string, string>;
}

export async function submitContactForm(
  _previous: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const parsed = ContactSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    topic: formData.get('topic'),
    message: formData.get('message'),
    website: formData.get('website') ?? '',
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      fieldErrors[key] ??= issue.message;
    }
    return { status: 'error', message: 'Please check the highlighted fields.', fieldErrors };
  }

  // Silently accept the honeypot so a bot does not learn it was detected.
  if (parsed.data.website) {
    return { status: 'success', message: 'Thanks — we have your message and will reply shortly.' };
  }

  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? headerList.get('x-real-ip') ?? 'unknown';

  const limit = await consumeRateLimit('contactForm', ip);
  if (!limit.allowed) {
    return {
      status: 'error',
      message: 'You have sent several messages recently. Please try again in a little while.',
    };
  }

  const settings = await getSettings();

  const rendered = renderEmail({
    subject: `[${parsed.data.topic}] Contact form — ${parsed.data.name}`,
    body: `A message was submitted through the ${settings.brandName} contact form.

From: ${parsed.data.name}
Reply to: ${parsed.data.email}
Topic: ${parsed.data.topic}

${parsed.data.message}`,
    brandName: settings.brandName,
    appUrl: process.env.APP_URL ?? '',
    supportEmail: settings.supportEmail,
  });

  const result = await getEmailProvider().send({
    to: settings.supportEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  if (!result.ok) {
    logger.error('Contact form delivery failed', { error: result.error });
    return {
      status: 'error',
      message: `We could not send that just now. Please email ${settings.supportEmail} directly.`,
    };
  }

  await prisma.emailLog
    .create({
      data: {
        templateKey: 'contact_form',
        toEmail: settings.supportEmail,
        subject: rendered.subject,
        status: 'SENT',
        providerMessageId: result.providerMessageId,
      },
    })
    .catch(() => undefined);

  return {
    status: 'success',
    message: 'Thanks — your message is with us. We reply to everything within one working day.',
  };
}
