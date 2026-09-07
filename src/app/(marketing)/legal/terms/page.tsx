import type { Metadata } from 'next';
import { LegalDocument } from '@/components/marketing/legal-layout';
import { getSettings } from '@/server/settings';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The agreement between you and ResellSnap AI.',
  alternates: { canonical: '/legal/terms' },
};

export default async function TermsPage() {
  const settings = await getSettings();

  return (
    <LegalDocument
      title="Terms of Service"
      effectiveDate="1 January 2026"
      version={1}
      summary={`These terms govern your use of ${settings.brandName}. They are written to be read, not to be skipped. If anything is unclear, email ${settings.supportEmail} and we will explain it.`}
      sections={[
        {
          heading: 'What this service does',
          paragraphs: [
            `${settings.brandName} analyses photographs of second-hand items you upload and generates draft marketplace listings, attribute suggestions and price estimates. Everything it produces is a draft for you to review and edit.`,
            'The service is a writing and organisation tool. It is not a valuation service, an authentication service, a legal adviser or a guarantee of any sales outcome.',
          ],
        },
        {
          heading: 'Your account',
          paragraphs: [
            'You must be at least 18 years old and provide accurate registration details. You are responsible for keeping your password confidential and for all activity under your account.',
            'One person or business per account. You may not share credentials, resell access, or use the service to generate listings on behalf of third parties without telling us.',
          ],
        },
        {
          heading: 'Your content and your responsibility',
          paragraphs: [
            'You keep ownership of the photographs you upload and of the listings you publish. You grant us the limited licence needed to store, process and display that content to you, and to send it to our AI provider to generate your drafts.',
            'You are solely responsible for the accuracy of every listing you publish and for complying with the policies, laws and consumer-protection rules that apply to your sales. Reviewing a draft before publishing is not optional — it is the core of how this product is meant to be used.',
          ],
          bullets: [
            'You confirm you have the right to sell every item you list.',
            'You confirm that photographs you upload are yours to upload.',
            'You will not use the service to list counterfeit, stolen, prohibited or unsafe goods.',
            'You will not present an AI inference as a verified fact.',
          ],
        },
        {
          heading: 'What the AI does and does not do',
          paragraphs: [
            'The AI describes what is visible in your photographs. It cannot authenticate an item, verify a brand or model, confirm a size, assess internal condition, or detect damage that is not visible. We never claim otherwise, and you must not represent our output as having done so.',
            'Price suggestions are estimates. Where they are based on marketplace data or your own sales history, we say so. Where they are not, we label them plainly as estimates derived from item attributes alone. No suggestion is a valuation or a promise of a sale price.',
          ],
        },
        {
          heading: 'Marketplace connections',
          paragraphs: [
            'Where a marketplace offers an approved official API and you connect your account, you authorise us to act within the scopes you granted. Nothing is ever published without your explicit, per-listing confirmation.',
            'We are an independent product. We are not endorsed by, affiliated with or sponsored by eBay, Vinted, Depop, Meta or Facebook. Your relationship with each marketplace is governed by that marketplace’s own terms, and you remain responsible for complying with them.',
          ],
        },
        {
          heading: 'Credits, plans and payment',
          paragraphs: [
            'One credit covers a full generation run. Editing, copying, exporting, publishing and regenerating a single platform variant do not consume credits. If a generation fails after our retries, the credit is returned automatically.',
            'Subscription credits reset at the start of each billing period and do not roll over. Purchased credit packs do not expire and are spent only after your subscription credits. Payments are processed by Stripe; we do not see or store your card details.',
            'You may cancel at any time and your plan will run to the end of the period you have paid for. We do not provide refunds for partial periods except where required by law.',
          ],
        },
        {
          heading: 'Acceptable use',
          paragraphs: [
            'The Acceptable Use Policy forms part of these terms. In short: do not use the service to deceive buyers, to list prohibited goods, to attempt to extract our prompts or models, or to place unreasonable load on the service.',
          ],
        },
        {
          heading: 'Availability and changes',
          paragraphs: [
            'We aim for high availability but do not guarantee uninterrupted service. We may change features, and we may suspend generation during an incident. Where a change materially reduces what you have paid for, we will tell you and offer a fair remedy.',
            'We may update these terms. Material changes will be notified by email or in-product before they take effect, and the version number above will increase.',
          ],
        },
        {
          heading: 'Suspension and termination',
          paragraphs: [
            'We may suspend or close an account that breaches these terms or the Acceptable Use Policy, or where we are legally required to. Where circumstances allow, we will tell you why and give you a chance to respond.',
            'You may close your account at any time from your settings. See the Privacy Policy for what happens to your data.',
          ],
        },
        {
          heading: 'Liability',
          paragraphs: [
            'To the fullest extent permitted by law, we are not liable for lost sales, lost profits, marketplace account actions, or any indirect or consequential loss arising from your use of the service. Our total liability in any twelve-month period is limited to the amount you paid us in that period.',
            'Nothing in these terms limits liability that cannot lawfully be limited, including for death or personal injury caused by negligence, or for fraud.',
          ],
        },
        {
          heading: 'Contact',
          paragraphs: [
            `Questions about these terms: ${settings.supportEmail}.`,
          ],
        },
      ]}
    />
  );
}
