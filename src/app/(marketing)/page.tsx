import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Camera,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  Layers,
  PenLine,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Alert, Badge, Button, Card, CardContent } from '@/components/ui';
import { Section, SectionHeading } from '@/components/marketing/section';
import { HeroVisual } from '@/components/marketing/hero-visual';
import { PlatformCapabilityGrid } from '@/components/marketing/platform-capability-grid';
import { PricingTable } from '@/components/marketing/pricing-table';
import { FaqList } from '@/components/marketing/faq-list';
import { getSettings } from '@/server/settings';
import { getPublicFaq, getVisiblePlans } from '@/server/public-data';
import { AI_DISCLAIMER, SITE } from '@/lib/site';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

const STEPS = [
  {
    icon: Camera,
    title: 'Upload',
    body: 'Photograph the item from a few angles. Drag them in, or shoot straight from your phone. We check for blur, low light and missing angles as you go.',
  },
  {
    icon: ClipboardCheck,
    title: 'Review',
    body: 'Confirm the things only you can know — size, defects, what is included. Everything the AI inferred is shown with its confidence and the photo it came from.',
  },
  {
    icon: Download,
    title: 'Publish or export',
    body: 'Publish directly to eBay after a final confirmation, or copy and export a ready-made listing for Vinted, Depop and Facebook Marketplace.',
  },
];

const FEATURES = [
  {
    icon: Sparkles,
    title: 'Photo analysis that shows its work',
    body: 'Every inference carries a confidence level and a reference to the photo it came from — "logo visible in photo 2". Nothing becomes a stated fact until you accept it.',
  },
  {
    icon: ClipboardCheck,
    title: 'Condition prompts that protect you',
    body: 'The wizard asks only what a photograph cannot answer, and adapts by category. Clothing gets measurements; electronics gets tested status and accessories.',
  },
  {
    icon: Layers,
    title: 'Copy tailored per marketplace',
    body: 'eBay gets a factual, searchable title. Vinted gets natural language. Depop gets style-forward copy with restrained hashtags. Facebook gets local and direct.',
  },
  {
    icon: CircleDollarSign,
    title: 'Price ranges you can audit',
    body: 'Three suggestions — quick sale, balanced, maximise return — each labelled with its source, confidence and basis. We never invent comparable sales.',
  },
  {
    icon: Download,
    title: 'Exports that save real minutes',
    body: 'Per-field copy buttons, a full listing copy, a photo ZIP in listing order, and text, JSON or CSV output where it is useful.',
  },
  {
    icon: PenLine,
    title: 'Inventory that stays honest',
    body: 'One internal SKU per physical item across every platform variant. Track draft, listed, sold and archived, record sale prices and fees, and see what actually sold.',
  },
];

export default async function HomePage() {
  const [settings, plans, faq] = await Promise.all([getSettings(), getVisiblePlans(), getPublicFaq()]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: SITE.description,
    url: SITE.url,
    offers: plans
      .filter((plan) => plan.kind !== 'CREDIT_PACK')
      .map((plan) => ({
        '@type': 'Offer',
        name: plan.name,
        price: (plan.priceCents / 100).toFixed(2),
        priceCurrency: plan.currency,
      })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Serialised from values we control; no user input reaches this node.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {settings.homepageAnnouncement ? (
        <div className="border-b border-lime-deep/30 bg-lime-wash px-4 py-2.5 text-center text-[13px] text-ink">
          {settings.homepageAnnouncement}
        </div>
      ) : null}

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-stone-200 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <Badge tone="neutral" className="mb-5">
              <span className="size-1.5 rounded-full bg-lime-deep" aria-hidden="true" />
              For people who resell, not for people who write copy
            </Badge>

            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]">
              Snap it. List it. Sell it.
            </h1>

            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-soft">
              Turn 6 photos into 4 ready-to-list drafts. ResellSnap AI reads your item photos and
              writes editable eBay, Vinted, Depop and Facebook Marketplace listings, with price
              suggestions that tell you where they came from.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="primary" size="lg">
                <Link href="/register">
                  Create my first listing
                  <ArrowRight />
                </Link>
              </Button>
              {settings.demoVisible ? (
                <Button asChild variant="outline" size="lg">
                  <Link href="/demo">Try the live demo</Link>
                </Button>
              ) : null}
            </div>

            <p className="mt-5 text-[13px] text-muted">
              3 free listing credits. No card required. Nothing publishes without your confirmation.
            </p>
          </div>

          <HeroVisual />
        </div>
      </section>

      {/* Three steps */}
      <Section tone="paper">
        <SectionHeading
          eyebrow="How it works"
          title="Upload, review, publish or export"
          description="Three steps, and the middle one is the point. You confirm what the AI could not know before anything is written."
        />

        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-ink text-bone">
                  <step.icon className="size-4.5" aria-hidden="true" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
                  Step {index + 1}
                </span>
              </div>
              <h3 className="mt-4 text-[17px] font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Before / after */}
      <Section>
        <SectionHeading
          eyebrow="Before and after"
          title="From what you would have typed, to what sells"
          description="A real example from the sample workspace. Same item, same photos."
        />

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <Card className="border-dashed">
            <CardContent className="p-6">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
                Typed in a hurry
              </p>
              <p className="mt-4 font-mono text-[13px] leading-relaxed text-ink-soft">
                cream trainers size 8 good condition
              </p>
              <p className="mt-3 font-mono text-[13px] leading-relaxed text-muted">
                worn a few times. some marks. collection or post.
              </p>
              <ul className="mt-6 space-y-1.5 text-[12px] text-muted">
                <li>· No searchable attributes for buyers to filter on</li>
                <li>· Vague defect wording invites returns and disputes</li>
                <li>· Nothing about measurements or what is included</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink">
                After ResellSnap AI
              </p>
              <p className="mt-4 text-[14px] font-semibold leading-snug text-ink">
                Cream leather low-top trainers — UK 8 / US 9, very good condition
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
                Cream leather low-top trainers in very good used condition. Worn a handful of times.
                There is light scuffing on the right toe and mild discolouration on the sole, both
                shown in the photographs. The uppers are clean and the shape is intact.
              </p>
              <ul className="mt-6 space-y-1.5 text-[12px] text-muted">
                <li>· Attributes buyers actually filter by: size, colour, material, style</li>
                <li>· Defects disclosed precisely, with the photo that shows them</li>
                <li>· Rewritten again for each marketplace, within its character limits</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* Platform honesty */}
      <Section tone="paper">
        <SectionHeading
          eyebrow="Platforms"
          title="What each marketplace actually allows"
          description="Some tools imply one-click posting everywhere. Here is the real picture, stated before you sign up."
        />
        <div className="mt-10">
          <PlatformCapabilityGrid />
        </div>
        <Alert tone="neutral" className="mt-6">
          We will not scrape marketplaces, automate their websites, ask for your marketplace password
          or use undocumented private APIs. Those techniques get seller accounts suspended, and your
          account is the asset.
        </Alert>
      </Section>

      {/* Features */}
      <Section>
        <SectionHeading eyebrow="Features" title="Built around the parts that are actually hard" />
        <div className="mt-10 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title}>
              <feature.icon className="size-5 text-ink" aria-hidden="true" />
              <h3 className="mt-3 text-[15px] font-semibold text-ink">{feature.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{feature.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Pricing */}
      <Section tone="paper" id="pricing">
        <SectionHeading
          eyebrow="Pricing"
          title="Pay for generations, not for seats"
          description="One credit covers a full run: analysis, master listing and all four platform drafts. Editing, copying and exporting are always free."
          align="center"
        />
        <div className="mt-10">
          <PricingTable plans={plans} />
        </div>
      </Section>

      {/* FAQ */}
      <Section>
        <SectionHeading eyebrow="Questions" title="The things people ask before signing up" />
        <div className="mt-8 max-w-3xl">
          <FaqList entries={faq} />
        </div>
      </Section>

      {/* Final CTA */}
      <Section tone="ink">
        <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight text-bone sm:text-3xl">
              Your next listing takes minutes, not an evening.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-bone/70">
              Start with three free listing credits. No card, no trial countdown, and nothing
              publishes anywhere without you pressing the button.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="primary" size="lg">
              <Link href="/register">
                Start free
                <ArrowRight />
              </Link>
            </Button>
            {settings.demoVisible ? (
              <Button
                asChild
                size="lg"
                className="border border-bone/25 bg-transparent text-bone hover:bg-bone/10"
              >
                <Link href="/demo">See the demo first</Link>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-10 flex items-start gap-3 border-t border-bone/15 pt-6">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-lime" aria-hidden="true" />
          <p className="text-[12px] leading-relaxed text-bone/60">{AI_DISCLAIMER}</p>
        </div>
      </Section>
    </>
  );
}
