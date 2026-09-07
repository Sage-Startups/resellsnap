import Link from 'next/link';
import type { Metadata } from 'next';
import { Alert, Button, Card, CardContent } from '@/components/ui';
import { Section, SectionHeading } from '@/components/marketing/section';
import {
  MARKETING_PLATFORM_ROWS,
  PlatformCapabilityGrid,
} from '@/components/marketing/platform-capability-grid';
import { NON_AFFILIATION_NOTICE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Platforms',
  description:
    'What ResellSnap AI can and cannot do on eBay, Vinted, Depop and Facebook Marketplace — stated plainly, with the reason for each limitation.',
  alternates: { canonical: '/platforms' },
};

const TONE_NOTES = [
  {
    platform: 'eBay',
    voice: 'Factual and searchable',
    detail:
      'Titles lead with the attributes buyers filter on: item type, brand where confirmed, model, size, colour, material. The description is scannable with an explicit condition section. Item specifics are populated from confirmed facts only.',
  },
  {
    platform: 'Vinted',
    voice: 'Natural and human',
    detail:
      'Written the way one person describes something to another. Flaws are mentioned early, not buried. Measurements are included when you supply them, because Vinted buyers ask for them constantly. No hashtags.',
  },
  {
    platform: 'Depop',
    voice: 'Style-forward but honest',
    detail:
      'Leads with the look and the fit, then the facts. At most five genuinely relevant hashtags covering style, era and category — never a brand you have not confirmed, and never a wall of tags.',
  },
  {
    platform: 'Facebook Marketplace',
    voice: 'Local and direct',
    detail:
      'Short sentences for a buyer who is nearby and wants to know whether it is still available and when they can collect. Collection and delivery terms are stated up front.',
  },
];

export default function PlatformsPage() {
  return (
    <>
      <Section>
        <SectionHeading
          level={1}
          eyebrow="Platforms"
          title="Four marketplaces, two very different levels of access"
          description="Marketplace APIs are not equal, and pretending otherwise puts your seller account at risk. Here is exactly what is possible today."
        />
        <div className="mt-10">
          <PlatformCapabilityGrid />
        </div>
      </Section>

      <Section tone="paper">
        <SectionHeading
          eyebrow="Why the difference"
          title="What we will not do to close the gap"
        />
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {[
            {
              title: 'No scraping',
              body: 'We do not read marketplace pages programmatically to harvest listings or sold prices. It breaches their terms and the data is unreliable anyway.',
            },
            {
              title: 'No browser automation',
              body: 'We will not drive a headless browser through a marketplace’s seller flow on your behalf, and we will not ask for your marketplace password. Both are grounds for suspension.',
            },
            {
              title: 'No private APIs',
              body: 'We do not reverse-engineer mobile applications or use undocumented endpoints. If access is not officially granted, we say so and build the best export instead.',
            },
          ].map((entry) => (
            <Card key={entry.title}>
              <CardContent className="p-5">
                <h3 className="text-[15px] font-semibold text-ink">{entry.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{entry.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Alert tone="info" className="mt-6">
          If an official API becomes available for Vinted, Depop or Facebook Marketplace, the adapter
          contract, settings and admin capability flags are already in place — enabling it is a
          configuration change, not a rewrite.
        </Alert>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Voice per platform"
          title="The same item, written four different ways"
          description="Platform templates are data, not hard-coded assumptions. An operator can edit every limit and tone rule in the admin console."
        />
        <div className="mt-8 divide-y divide-stone-200 border-y border-stone-200">
          {TONE_NOTES.map((note) => (
            <div key={note.platform} className="grid gap-2 py-5 sm:grid-cols-[180px_1fr] sm:gap-6">
              <div>
                <p className="text-[15px] font-semibold text-ink">{note.platform}</p>
                <p className="text-[12px] text-muted">{note.voice}</p>
              </div>
              <p className="text-[14px] leading-relaxed text-muted">{note.detail}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="ink">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight text-bone">
              See it on {MARKETING_PLATFORM_ROWS.length} marketplaces at once.
            </h2>
            <p className="mt-2 text-[14px] text-bone/70">
              The demo runs the whole flow with sample data and no account.
            </p>
          </div>
          <Button asChild variant="primary" size="lg">
            <Link href="/demo">Open the live demo</Link>
          </Button>
        </div>
        <p className="mt-8 border-t border-bone/15 pt-6 text-[12px] leading-relaxed text-bone/60">
          {NON_AFFILIATION_NOTICE}
        </p>
      </Section>
    </>
  );
}
