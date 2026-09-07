import type { Metadata } from 'next';
import { LegalDocument } from '@/components/marketing/legal-layout';
import { getSettings } from '@/server/settings';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What ResellSnap AI collects, why, how long it is kept, and how to get it back or delete it.',
  alternates: { canonical: '/legal/privacy' },
};

export default async function PrivacyPage() {
  const settings = await getSettings();

  return (
    <LegalDocument
      title="Privacy Policy"
      effectiveDate="1 January 2026"
      version={1}
      summary={`What ${settings.brandName} collects, why we collect it, who else sees it, and how to get it back or delete it. We collect the minimum needed to run the product.`}
      sections={[
        {
          heading: 'What we collect',
          paragraphs: ['We hold three kinds of information.'],
          bullets: [
            'Account data: your name, email address, password hash, timezone, locale and notification preferences.',
            'Item data: the photographs you upload, the facts you confirm about each item, the drafts we generate, your price and sale records, and your inventory history.',
            'Operational data: sign-in times, IP address and user agent for security, job and error records, and product analytics events from a fixed, documented list of event names.',
          ],
        },
        {
          heading: 'Your photographs',
          paragraphs: [
            'Photographs are stored privately in our object storage. They are never public, and are served to you only through short-lived signed links.',
            'Before a photo is stored permanently we re-encode it, which removes EXIF metadata — including GPS coordinates and camera serial numbers. We do this because a photo of an item in your home should not carry your address.',
            'To generate your analysis, photograph data is sent to our AI provider. It is transmitted for that request and is not used by us to train any model.',
          ],
        },
        {
          heading: 'Why we process it',
          paragraphs: [
            'To provide the service you asked for (performing our contract with you): storing your items, generating drafts, publishing where you have connected a marketplace, and taking payment.',
            'To keep the service secure and working (our legitimate interests): rate limiting, fraud prevention, error diagnosis and capacity planning.',
            'To send you essential messages about your account, security and billing. Non-essential product email is opt-in and can be turned off in your settings at any time.',
          ],
        },
        {
          heading: 'Who else sees it',
          paragraphs: [
            'We use a small number of processors, each for a specific purpose, and we do not sell your data to anyone.',
          ],
          bullets: [
            'Our AI provider: photographs and confirmed item facts, for the duration of each generation request.',
            'Stripe: your email and billing details, to process payments. We never receive your card number.',
            'Resend: your email address and message content, to deliver transactional email.',
            'Railway: hosting for the application, the database and your stored photographs.',
            'A marketplace you connect: only the listing content you explicitly confirm for publication.',
          ],
        },
        {
          heading: 'How long we keep it',
          paragraphs: [
            'Active account data is kept while your account is open. Deleted items stay recoverable for a grace period and are then permanently purged along with their photographs.',
            `Current retention windows on this deployment: deleted items ${settings.deletedItemRetentionDays} days, incomplete uploads ${settings.failedUploadRetentionHours} hours, generated exports ${settings.exportArtifactRetentionHours} hours. Billing records are kept for as long as tax and accounting law requires.`,
          ],
        },
        {
          heading: 'Your rights',
          paragraphs: [
            'You can export a machine-readable copy of your account and item data, and request deletion of your account, from your settings page. Deletion removes your items and photographs; billing records are retained only where legally required.',
            'Depending on where you live you may also have rights to correct data, restrict or object to processing, or complain to a supervisory authority. Email us and we will help.',
          ],
        },
        {
          heading: 'Cookies and analytics',
          paragraphs: [
            'We set a secure, HTTP-only session cookie so you stay signed in. That cookie is strictly necessary and cannot be turned off while you are using the app.',
            'Product analytics are first-party and event-based, recorded against a fixed list of event names such as "listing generated". We do not run advertising trackers, we do not build cross-site profiles, and we do not embed third-party tracking pixels.',
          ],
        },
        {
          heading: 'Security',
          paragraphs: [
            'Passwords are hashed. Marketplace access and refresh tokens are encrypted at rest with AES-256-GCM. Secrets, tokens, cookies and personal data are redacted from our logs. Access to production data is limited and audited.',
            'No system is perfect. If you believe you have found a vulnerability, email ' + settings.supportEmail + ' with "Security" in the subject line.',
          ],
        },
        {
          heading: 'Children',
          paragraphs: [
            'The service is not intended for anyone under 18 and we do not knowingly collect their data.',
          ],
        },
        {
          heading: 'Contact',
          paragraphs: [`Privacy questions and data requests: ${settings.supportEmail}.`],
        },
      ]}
    />
  );
}
