import Link from 'next/link';
import type { Metadata } from 'next';
import { Button, Card, CardContent, Badge } from '@/components/ui';
import { Section, SectionHeading } from '@/components/marketing/section';
import { AI_DISCLAIMER } from '@/lib/site';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'The full path from photographing an item to a published or exported listing, including what the AI does, what it refuses to do, and where you stay in control.',
  alternates: { canonical: '/how-it-works' },
};

const STAGES = [
  {
    number: '01',
    title: 'Photograph the item',
    duration: '2–3 minutes',
    body: 'Front, back, label, and a close-up of anything wrong with it. Upload 1–12 photos by drag-and-drop, file picker, or your phone camera. Reorder them, pick a cover, remove one, retry a failed upload.',
    detail:
      'As each photo lands we check the actual bytes — not the filename — for a real JPEG, PNG or WebP, strip location and camera metadata, and generate a thumbnail. Blur, low light and duplicates are flagged as suggestions, never as blockers.',
  },
  {
    number: '02',
    title: 'Tell us what a photo cannot',
    duration: '1 minute',
    body: 'Size, measurements, defects, whether it has been tested, what is included, your acquisition cost and minimum acceptable price. The form adapts to the category so it only asks relevant questions.',
    detail:
      'Everything you enter is recorded as a seller-confirmed fact. Confirmed facts outrank every AI inference: if the model thinks it sees something different, yours wins and the discrepancy is noted.',
  },
  {
    number: '03',
    title: 'The analysis runs',
    duration: '20–60 seconds',
    body: 'All photos are analysed together. You get a generic item type, candidate attributes with confidence levels, visible condition evidence tied to specific photos, photo quality warnings, keywords, and questions worth answering.',
    detail:
      'Text visible inside your photos is treated strictly as observed data, never as an instruction to the model. If the response does not match the expected structure, the job retries and then fails honestly rather than writing a guess into your listing.',
  },
  {
    number: '04',
    title: 'Confirm what is uncertain',
    duration: '1 minute',
    body: 'Every inference appears with its confidence and the photo it came from. Accept it, edit it, or clear it. Low-confidence guesses are highlighted so you cannot miss them.',
    detail:
      'This step is why the drafts are safe to publish. The AI never silently promotes a guess into a stated fact — that is what gets sellers into trouble with buyers and with marketplace policy.',
  },
  {
    number: '05',
    title: 'Review the drafts',
    duration: '2 minutes',
    body: 'A master listing plus four platform variants, each with live character counters, completeness checks and per-field copy buttons. Change the tone, regenerate a single platform, restore an earlier revision.',
    detail:
      'Price suggestions arrive alongside: quick sale, balanced and maximise return, each labelled with where the number came from and how confident it is. Add your acquisition cost to see estimated fees, shipping and net proceeds.',
  },
  {
    number: '06',
    title: 'Publish or export',
    duration: 'Seconds',
    body: 'Publish to eBay after a final confirmation, or copy and export for Vinted, Depop and Facebook Marketplace. Then mark the item as listed and, when it sells, record the sale.',
    detail:
      'Nothing is ever published automatically. Direct publishing exists only where an approved official API supports it, your account is connected, and you have confirmed the exact content.',
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="How it works"
          title="Roughly seven minutes, most of it yours"
          description="The AI handles the writing and the platform formatting. You handle the judgement calls, because you are the one who has the item in your hands."
        />
      </Section>

      <Section tone="paper">
        <ol className="space-y-8">
          {STAGES.map((stage) => (
            <li key={stage.number}>
              <Card>
                <CardContent className="grid gap-5 p-6 md:grid-cols-[auto_1fr] md:gap-8">
                  <div className="flex items-baseline gap-3 md:block">
                    <span className="font-mono text-2xl font-semibold tabular-nums text-stone-300">
                      {stage.number}
                    </span>
                    <Badge tone="neutral" className="md:mt-3">
                      {stage.duration}
                    </Badge>
                  </div>
                  <div>
                    <h2 className="text-[17px] font-semibold text-ink">{stage.title}</h2>
                    <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{stage.body}</p>
                    <p className="mt-3 border-l-2 border-stone-200 pl-4 text-[13px] leading-relaxed text-muted">
                      {stage.detail}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </Section>

      <Section>
        <SectionHeading eyebrow="Credits" title="What one credit covers" />
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <Card>
            <CardContent className="p-5">
              <h3 className="text-[15px] font-semibold text-ink">Uses a credit</h3>
              <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
                <li>· Analysing your photos and generating the master listing plus all four platform drafts</li>
                <li>· Running a completely fresh analysis on the same item</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <h3 className="text-[15px] font-semibold text-ink">Free, always</h3>
              <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
                <li>· Editing any field, on any variant</li>
                <li>· Regenerating a single platform variant</li>
                <li>· Copying, exporting, downloading photos</li>
                <li>· Publishing, updating and ending listings</li>
              </ul>
            </CardContent>
          </Card>
        </div>
        <p className="mt-5 text-[13px] text-muted">
          If a generation fails after our retries, the credit is returned automatically — exactly
          once, guaranteed by an append-only ledger.
        </p>
      </Section>

      <Section tone="ink">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="max-w-lg text-2xl font-semibold tracking-tight text-bone">
            Try the whole flow without signing up.
          </h2>
          <div className="flex gap-3">
            <Button asChild variant="primary" size="lg">
              <Link href="/demo">Open the demo</Link>
            </Button>
            <Button
              asChild
              size="lg"
              className="border border-bone/25 bg-transparent text-bone hover:bg-bone/10"
            >
              <Link href="/register">Start free</Link>
            </Button>
          </div>
        </div>
        <p className="mt-8 border-t border-bone/15 pt-6 text-[12px] leading-relaxed text-bone/60">
          {AI_DISCLAIMER}
        </p>
      </Section>
    </>
  );
}
