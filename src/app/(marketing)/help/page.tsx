import Link from 'next/link';
import type { Metadata } from 'next';
import { Button, Card, CardContent } from '@/components/ui';
import { Section, SectionHeading } from '@/components/marketing/section';
import { FaqList } from '@/components/marketing/faq-list';
import { getPublicFaq } from '@/server/public-data';
import { getSettings } from '@/server/settings';

export const metadata: Metadata = {
  title: 'Help',
  description:
    'Guides for photographing items, confirming AI observations, connecting eBay, exporting to other marketplaces, credits and billing.',
  alternates: { canonical: '/help' },
};

const GUIDES = [
  {
    title: 'Taking photos that produce better listings',
    body: 'Six photos beats three. Shoot in daylight against a plain background. Always include the label or model plate, and always photograph the flaw — a disclosed defect prevents a return, a hidden one causes a dispute.',
  },
  {
    title: 'Confirming what the AI inferred',
    body: 'Anything marked low or medium confidence needs your eye. The evidence note tells you which photo produced the guess. Accept it, correct it, or clear it — a cleared field simply will not appear in the listing.',
  },
  {
    title: 'Connecting your eBay account',
    body: 'Go to Integrations and choose Connect eBay. You will authorise on eBay’s own site and can revoke access from either side. Before publishing, eBay requires payment, shipping and returns business policies and an inventory location — we check and tell you what is missing.',
  },
  {
    title: 'Exporting to Vinted, Depop and Facebook Marketplace',
    body: 'Open the platform tab, use the copy buttons per field or copy the whole listing, then download the photo ZIP. Open the marketplace with the provided link, paste, and upload the photos in the order they are numbered.',
  },
  {
    title: 'Understanding a price suggestion',
    body: 'Each suggestion shows its source and confidence. "AI estimate" means no sales data was available and the number comes from the item’s attributes alone. Treat it as a starting point and set your own price with confidence — you know your market.',
  },
  {
    title: 'Credits, plans and refunds',
    body: 'One credit per full generation. Editing and exporting are free. Monthly plan credits reset each period; purchased pack credits do not expire and are spent only after your monthly ones. A generation that fails after retries returns its credit automatically.',
  },
];

export default async function HelpPage() {
  const [faq, settings] = await Promise.all([getPublicFaq(), getSettings()]);

  return (
    <>
      <Section>
        <SectionHeading
          level={1}
          eyebrow="Help centre"
          title="Short answers to the things that come up"
          description="If none of this covers it, email us — a person replies."
        />
      </Section>

      <Section tone="paper">
        <h2 className="text-xl font-semibold tracking-tight text-ink">Guides</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {GUIDES.map((guide) => (
            <Card key={guide.title}>
              <CardContent className="p-5">
                <h3 className="text-[15px] font-semibold text-ink">{guide.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{guide.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight text-ink">Frequently asked</h2>
        <div className="mt-6 max-w-3xl">
          <FaqList entries={faq} />
        </div>
      </Section>

      <Section tone="paper">
        <div className="flex flex-col items-start gap-5 rounded-xl border border-stone-200 bg-bone p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[17px] font-semibold text-ink">Still stuck?</h2>
            <p className="mt-1 text-[13px] text-muted">
              Email{' '}
              <a
                href={`mailto:${settings.supportEmail}`}
                className="underline underline-offset-4 hover:text-ink"
              >
                {settings.supportEmail}
              </a>{' '}
              or use the contact form.
            </p>
          </div>
          <Button asChild variant="primary">
            <Link href="/contact">Contact support</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
