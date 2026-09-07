import type { Metadata } from 'next';
import { LegalDocument } from '@/components/marketing/legal-layout';
import { getSettings } from '@/server/settings';

export const metadata: Metadata = {
  title: 'Acceptable Use Policy',
  description: 'What you may and may not do with ResellSnap AI.',
  alternates: { canonical: '/legal/acceptable-use' },
};

export default async function AcceptableUsePage() {
  const settings = await getSettings();

  return (
    <LegalDocument
      title="Acceptable Use Policy"
      effectiveDate="1 January 2026"
      version={1}
      summary="Most of this comes down to one idea: do not use this tool to mislead a buyer. The rest is detail."
      sections={[
        {
          heading: 'Honest listings',
          paragraphs: [
            'The product is built to help you describe items accurately. Using it to do the opposite is a breach of this policy.',
          ],
          bullets: [
            'Do not present an AI inference as a verified fact. If the tool marks something low confidence and you cannot confirm it, remove it.',
            'Do not claim an item has been authenticated, tested or verified when it has not.',
            'Do not describe a used item as new, or omit a defect that the photographs or your own knowledge reveal.',
            'Do not add keyword stuffing, fabricated scarcity, or brand names you have not confirmed.',
          ],
        },
        {
          heading: 'Prohibited items',
          paragraphs: [
            'Do not use the service to prepare listings for goods that are illegal to sell in your jurisdiction, or that the destination marketplace prohibits.',
          ],
          bullets: [
            'Counterfeit or replica goods, and anything infringing a trademark or copyright.',
            'Weapons, ammunition and regulated weapon parts.',
            'Recalled products, and unsafe or non-compliant electrical goods.',
            'Prescription medicines, controlled substances and drug paraphernalia.',
            'Stolen property, and items you do not have the right to sell.',
            'Hazardous materials, live animals, and human remains or bodily fluids.',
            'Anything requiring a licence you do not hold.',
          ],
        },
        {
          heading: 'Respecting marketplaces',
          paragraphs: [
            'Our own integrations are limited to approved official APIs, and we expect the same standard from you.',
          ],
          bullets: [
            'Do not use exported content to operate accounts that breach a marketplace’s terms.',
            'Do not use the service to run bulk automated posting that a marketplace prohibits.',
            'Do not attempt to route our output through unofficial marketplace endpoints.',
          ],
        },
        {
          heading: 'Respecting the service',
          paragraphs: ['Please do not try to break, drain or reverse-engineer the product.'],
          bullets: [
            'Do not attempt to extract system prompts, model configuration or other customers’ data.',
            'Do not upload content designed to manipulate the AI, including instructions hidden inside images. We treat image text strictly as data, but attempting this is still a breach.',
            'Do not circumvent credit limits, rate limits or entitlement checks.',
            'Do not upload malware, or files disguised as images.',
            'Do not scrape the service or resell access to it.',
          ],
        },
        {
          heading: 'Reporting and enforcement',
          paragraphs: [
            `If you see generated output that appears to breach this policy, use the report action in the product or email ${settings.supportEmail}. Every report is reviewed by a person.`,
            'Depending on severity we may remove content, suspend generation on an account, or close the account. Where circumstances allow, we will tell you what happened and give you a chance to respond.',
          ],
        },
      ]}
    />
  );
}
