import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Section, SectionHeading } from '@/components/marketing/section';
import { DemoExperience, type DemoItem } from './demo-experience';
import { getSettings } from '@/server/settings';
import { DEMO_ITEMS } from '../../../../prisma/fixtures/demo-items';
import { PLATFORM_NAMES } from '@/server/marketplace/registry';
import { CATEGORY_HINTS } from '@/server/items/facts';
import { FACT_LABELS } from '@/server/items/facts';
import { formatMoney } from '@/lib/money';

export const metadata: Metadata = {
  title: 'Live demo',
  description:
    'Walk the whole ResellSnap AI flow with sample data. No account, no upload, no AI cost — just the product.',
  alternates: { canonical: '/demo' },
};

const TITLE_LIMITS: Record<string, number> = {
  EBAY: 80,
  VINTED: 60,
  DEPOP: 65,
  FACEBOOK_MARKETPLACE: 100,
};

/**
 * Builds the demo payload from the same fixtures the seed uses, so the demo and
 * the sample workspace never drift apart. Nothing here touches the AI provider,
 * a marketplace API, or the database.
 */
function buildDemoItems(): DemoItem[] {
  return DEMO_ITEMS.map((fixture) => ({
    id: fixture.id,
    name: fixture.name,
    mockupId: fixture.mockupId,
    categoryLabel:
      CATEGORY_HINTS.find((hint) => hint.value === fixture.categoryHint)?.label ?? 'Other',
    facts: fixture.facts
      .filter((fact) => fact.source !== 'NEEDS_CONFIRMATION')
      .slice(0, 6)
      .map((fact) => ({
        label: FACT_LABELS[fact.key] ?? fact.key,
        value: fact.value,
        source: fact.source === 'SELLER_CONFIRMED' ? ('SELLER' as const) : ('AI' as const),
        confidence: fact.confidence,
        evidence: fact.evidence,
      })),
    master: {
      title: fixture.master.title,
      description: fixture.master.description,
      conditionSummary: fixture.master.conditionSummary,
    },
    variants: fixture.variants.map((variant) => ({
      platform: variant.platform,
      platformName: PLATFORM_NAMES[variant.platform],
      // eBay is the only platform with an approved publishing API.
      badge: variant.platform === 'EBAY' ? ('DIRECT_PUBLISHING' as const) : ('EXPORT_WORKFLOW' as const),
      title: variant.title,
      description: variant.description,
      fields: variant.fields,
      titleMaxLength: TITLE_LIMITS[variant.platform] ?? 80,
    })),
    prices: {
      quickSale: formatMoney(fixture.prices.quickSaleCents),
      balanced: formatMoney(fixture.prices.balancedCents),
      maximise: formatMoney(fixture.prices.maximiseReturnCents),
      basis: fixture.prices.explanation,
    },
  }));
}

export default async function DemoPage() {
  const settings = await getSettings();

  // Operators can hide the demo entirely from the admin settings screen.
  if (!settings.demoVisible) notFound();

  return (
    <>
      <Section className="pb-8">
        <SectionHeading
          eyebrow="Interactive demo — sample data"
          title="The whole flow, without signing up"
          description="Pick a fictional item and walk from photos to four marketplace drafts. Everything runs in your browser: no account, no upload, no AI cost, and nothing is saved."
        />
      </Section>

      <Section tone="paper" className="pt-0">
        <DemoExperience items={buildDemoItems()} />
      </Section>
    </>
  );
}
