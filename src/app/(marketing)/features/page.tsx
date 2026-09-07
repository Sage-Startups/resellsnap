import Link from 'next/link';
import type { Metadata } from 'next';
import {
  Camera, ClipboardCheck, CircleDollarSign, Download, Layers, LineChart,
  Lock, PenLine, RefreshCw, ShieldCheck, Sparkles, Warehouse,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { Section, SectionHeading } from '@/components/marketing/section';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Photo analysis with visible evidence, condition prompts that adapt by category, per-marketplace copy, transparent price ranges, exports and inventory tracking.',
  alternates: { canonical: '/features' },
};

const GROUPS = [
  {
    heading: 'From photos to a draft',
    items: [
      {
        icon: Camera,
        title: 'Multi-photo analysis',
        body: 'All your photos are analysed together, not one at a time, so evidence from the label in photo 4 informs the description written from photo 1. Upload 1–12 images by drag-and-drop, file picker or straight from your phone camera.',
      },
      {
        icon: Sparkles,
        title: 'Evidence you can check',
        body: 'Every inference comes with a confidence level and a pointer to the photograph that produced it — "embossed logo on tongue, photo 2". You can accept it, edit it or clear it. Nothing becomes a stated fact on its own.',
      },
      {
        icon: ClipboardCheck,
        title: 'Category-aware questions',
        body: 'The form adapts to what you are selling. Clothing asks for size, material and flat measurements. Electronics asks whether it has been tested and what accessories are included. It never asks for something a photo already answers.',
      },
      {
        icon: ShieldCheck,
        title: 'Photo quality checks',
        body: 'Blur, low light, overexposure, duplicates and missing angles are flagged as suggestions before you generate — never as blockers. Better photos in, better listing out.',
      },
    ],
  },
  {
    heading: 'Writing that fits each marketplace',
    items: [
      {
        icon: Layers,
        title: 'One master, four variants',
        body: 'A single factual master listing is generated first, then adapted for eBay, Vinted, Depop and Facebook Marketplace using each platform’s own character limits, required fields and tone rules.',
      },
      {
        icon: PenLine,
        title: 'Everything is editable',
        body: 'Every field is yours to change, with live character counters against each platform’s limit, autosave, and saved revisions you can restore. AI writes the first draft; you own the last one.',
      },
      {
        icon: RefreshCw,
        title: 'Regenerate what you need',
        body: 'Regenerate a single platform variant without re-running the analysis, at no credit cost. Four tone settings — straightforward, friendly, vintage, minimal — change the voice without changing the facts.',
      },
      {
        icon: Download,
        title: 'Exports built for speed',
        body: 'Per-field copy buttons, a one-tap full listing copy, a photo ZIP in listing order, and text, JSON or CSV output. Plus a direct link into each platform’s normal seller flow.',
      },
    ],
  },
  {
    heading: 'Pricing, inventory and proof',
    items: [
      {
        icon: CircleDollarSign,
        title: 'Three transparent price points',
        body: 'Quick sale, balanced and maximise return — each labelled with its source, confidence and basis. Official marketplace data, your own sales history, a maintained category guideline, or an AI estimate. Never a fabricated comparable.',
      },
      {
        icon: Warehouse,
        title: 'Inventory with a real SKU',
        body: 'One internal SKU per physical item across every platform variant, so you always know what is where. Track draft, ready, listed, sold, expired and archived, and record sale price, fees and shipping.',
      },
      {
        icon: LineChart,
        title: 'Analytics that separate fact from estimate',
        body: 'Sell-through rate, average days to sale, gross sales, estimated fees and net proceeds, broken down by platform and category. Numbers you entered are always distinguished from numbers an API supplied.',
      },
      {
        icon: Lock,
        title: 'Private by default',
        body: 'Photos live in private storage, served only through short-lived signed links, with location and camera metadata stripped before permanent storage. Delete an item and its photos go with it.',
      },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="Features"
          title="Everything between a pile of photos and a live listing"
          description="The interesting work is not writing a paragraph. It is knowing what you may honestly claim, what each marketplace requires, and what the item is actually worth."
        />
      </Section>

      {GROUPS.map((group, index) => (
        <Section key={group.heading} tone={index % 2 === 0 ? 'paper' : 'bone'}>
          <h2 className="text-xl font-semibold tracking-tight text-ink">{group.heading}</h2>
          <div className="mt-8 grid gap-x-10 gap-y-9 sm:grid-cols-2">
            {group.items.map((item) => (
              <div key={item.title}>
                <item.icon className="size-5 text-ink" aria-hidden="true" />
                <h3 className="mt-3 text-[15px] font-semibold text-ink">{item.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </Section>
      ))}

      <Section tone="ink">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="max-w-lg text-2xl font-semibold tracking-tight text-bone">
            Three free credits is enough to judge it on your own items.
          </h2>
          <Button asChild variant="primary" size="lg">
            <Link href="/register">Start free</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}
