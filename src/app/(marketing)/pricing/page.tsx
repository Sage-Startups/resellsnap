import type { Metadata } from 'next';
import { Section, SectionHeading } from '@/components/marketing/section';
import { PricingTable } from '@/components/marketing/pricing-table';
import { FaqList } from '@/components/marketing/faq-list';
import { Alert } from '@/components/ui';
import { getPublicFaq, getVisiblePlans } from '@/server/public-data';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Free to start with 3 listing credits. Starter at $15/month for 50 credits, Pro at $29/month for 200. One-off credit packs never expire.',
  alternates: { canonical: '/pricing' },
};

export default async function PricingPage() {
  const [plans, faq] = await Promise.all([getVisiblePlans(), getPublicFaq()]);

  const billingFaq = faq.filter((entry) =>
    ['faq_credits', 'faq_cancel', 'faq_pricing'].includes(entry.key),
  );

  return (
    <>
      <Section>
        <SectionHeading
          level={1}
          eyebrow="Pricing"
          title="Pay for what you generate"
          description="One credit covers a full run: analysis, master listing and all four platform drafts. Editing, copying, exporting and publishing are always free."
          align="center"
        />
        <div className="mt-12">
          <PricingTable plans={plans} />
        </div>
      </Section>

      <Section tone="paper">
        <div className="mx-auto max-w-3xl">
          <SectionHeading title="Billing questions" align="center" />
          <div className="mt-8">
            <FaqList entries={billingFaq} />
          </div>
          <Alert tone="neutral" className="mt-8">
            Prices are in US dollars and exclude any tax that may apply in your country. Payments are
            processed by Stripe; we never see or store your card details. Cancel at any time from
            your billing page — your plan runs to the end of the period you have paid for.
          </Alert>
        </div>
      </Section>
    </>
  );
}
