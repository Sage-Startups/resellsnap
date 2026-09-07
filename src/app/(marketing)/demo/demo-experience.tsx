'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Camera, CheckCircle2, ClipboardCheck, Copy, Download, Sparkles } from 'lucide-react';
import { Alert, Badge, Button, Card, CardContent, Input, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface DemoVariant {
  platform: string;
  platformName: string;
  badge: 'DIRECT_PUBLISHING' | 'EXPORT_WORKFLOW';
  title: string;
  description: string;
  fields: Record<string, string | string[]>;
  titleMaxLength: number;
}

export interface DemoItem {
  id: string;
  name: string;
  mockupId: string;
  categoryLabel: string;
  facts: Array<{ label: string; value: string; source: 'SELLER' | 'AI'; confidence?: string; evidence?: string }>;
  master: { title: string; description: string; conditionSummary: string };
  variants: DemoVariant[];
  prices: { quickSale: string; balanced: string; maximise: string; basis: string };
}

const STEPS = ['Photos', 'Your details', 'Drafts'] as const;

/**
 * The no-login demo.
 *
 * Everything is fixture data held in browser state: no AI call, no
 * marketplace call, no database write, no upload. Refreshing resets it. That
 * makes it free to run, impossible to abuse, and safe to link from the
 * homepage.
 */
export function DemoExperience({ items }: { items: DemoItem[] }) {
  const [selected, setSelected] = useState(items[0]?.id ?? '');
  const [step, setStep] = useState(0);
  const [tab, setTab] = useState('MASTER');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const item = items.find((entry) => entry.id === selected) ?? items[0];
  if (!item) return null;

  const variant = item.variants.find((entry) => entry.platform === tab);

  const valueFor = (key: string, fallback: string) => edits[`${item.id}:${key}`] ?? fallback;
  const setValue = (key: string, value: string) =>
    setEdits((current) => ({ ...current, [`${item.id}:${key}`]: value }));

  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      // Clipboard access can be blocked; the field is selectable regardless.
    }
  }

  return (
    <div className="space-y-6">
      <Alert tone="neutral">
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone="ink">Interactive demo — sample data</Badge>
          <span className="text-[13px]">
            Everything here is a fixture. Nothing is uploaded, no AI is called, nothing is saved, and
            refreshing starts over.
          </span>
        </span>
      </Alert>

      {/* Item picker */}
      <div>
        <p className="text-[13px] font-medium text-ink">Pick a sample item</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {items.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setSelected(entry.id);
                setStep(0);
                setTab('MASTER');
              }}
              aria-pressed={entry.id === selected}
              className={cn(
                'overflow-hidden rounded-lg border bg-paper text-left transition-colors',
                entry.id === selected
                  ? 'border-ink ring-1 ring-ink/10'
                  : 'border-stone-200 hover:border-stone-300',
              )}
            >
              <Image
                src={`/fixtures/${entry.mockupId}-front.webp`}
                alt=""
                width={320}
                height={320}
                className="aspect-square w-full object-cover"
              />
              <span className="block p-2.5">
                <span className="block text-[12px] font-medium text-ink">{entry.name}</span>
                <span className="block text-[11px] text-muted">{entry.categoryLabel}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Stepper */}
      <nav aria-label="Demo progress">
        <ol className="flex items-center gap-2">
          {STEPS.map((label, index) => (
            <li key={label} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(index)}
                aria-current={index === step ? 'step' : undefined}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5"
              >
                <span
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                    index < step && 'bg-success text-white',
                    index === step && 'bg-ink text-bone',
                    index > step && 'border border-stone-300 text-subtle',
                  )}
                >
                  {index < step ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : index + 1}
                </span>
                <span
                  className={cn(
                    'hidden text-[13px] font-medium sm:inline',
                    index === step ? 'text-ink' : 'text-muted',
                  )}
                >
                  {label}
                </span>
              </button>
              {index < STEPS.length - 1 ? (
                <span
                  className={cn('h-px flex-1', index < step ? 'bg-success/40' : 'bg-stone-200')}
                  aria-hidden="true"
                />
              ) : null}
            </li>
          ))}
        </ol>
      </nav>

      <Card>
        <CardContent className="p-5 sm:p-6">
          {/* Step 1 — photos */}
          {step === 0 ? (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <Camera className="size-4 text-ink" aria-hidden="true" />
                <h2 className="text-[15px] font-semibold text-ink">The photos</h2>
              </div>
              <p className="text-[13px] leading-relaxed text-muted">
                In the real product you drag photos in or shoot them on your phone. Here are three
                sample angles of the {item.name.toLowerCase()}.
              </p>

              <ul className="grid grid-cols-3 gap-3">
                {(['front', 'detail', 'back'] as const).map((angle, index) => (
                  <li key={angle} className="relative">
                    <Image
                      src={`/fixtures/${item.mockupId}-${angle}.webp`}
                      alt={`Sample ${angle} view of the ${item.name.toLowerCase()}`}
                      width={400}
                      height={400}
                      className="aspect-square w-full rounded-lg border border-stone-200 object-cover"
                    />
                    <span className="absolute left-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-medium text-bone">
                      {index + 1}
                    </span>
                  </li>
                ))}
              </ul>

              <Alert tone="neutral">
                We would flag blur, low light, duplicates and missing angles here — as suggestions,
                never as blockers.
              </Alert>
            </div>
          ) : null}

          {/* Step 2 — facts */}
          {step === 1 ? (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="size-4 text-ink" aria-hidden="true" />
                <h2 className="text-[15px] font-semibold text-ink">What we know, and how</h2>
              </div>
              <p className="text-[13px] leading-relaxed text-muted">
                This is the step that keeps listings honest. Things you confirmed are facts. Things
                the AI inferred stay marked as inferences, with the evidence behind them, until you
                accept them.
              </p>

              <ul className="space-y-2">
                {item.facts.map((fact) => (
                  <li
                    key={fact.label}
                    className={cn(
                      'rounded-lg border p-3',
                      fact.source === 'AI'
                        ? 'border-warning/25 bg-warning-wash/40'
                        : 'border-stone-200 bg-paper',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[12px] text-muted">{fact.label}</p>
                        <p className="text-[14px] font-medium text-ink">{fact.value}</p>
                      </div>
                      <Badge tone={fact.source === 'AI' ? 'warning' : 'success'}>
                        {fact.source === 'AI'
                          ? `AI inference · ${fact.confidence?.toLowerCase()} confidence`
                          : 'You confirmed this'}
                      </Badge>
                    </div>
                    {fact.evidence ? (
                      <p className="mt-1.5 text-[12px] italic text-muted">
                        &ldquo;{fact.evidence}&rdquo;
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Step 3 — drafts */}
          {step === 2 ? (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-ink" aria-hidden="true" />
                <h2 className="text-[15px] font-semibold text-ink">Your drafts</h2>
              </div>

              <div
                role="tablist"
                aria-label="Platform drafts"
                className="-mx-1 flex gap-1 overflow-x-auto border-b border-stone-200 px-1"
              >
                {[{ platform: 'MASTER', platformName: 'Master' }, ...item.variants].map((entry) => (
                  <button
                    key={entry.platform}
                    role="tab"
                    type="button"
                    aria-selected={tab === entry.platform}
                    onClick={() => setTab(entry.platform)}
                    className={cn(
                      'shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors',
                      tab === entry.platform
                        ? 'border-ink text-ink'
                        : 'border-transparent text-muted hover:text-ink-soft',
                    )}
                  >
                    {entry.platformName}
                  </button>
                ))}
              </div>

              {tab === 'MASTER' ? (
                <DemoField
                  label="Title"
                  value={valueFor('master-title', item.master.title)}
                  onChange={(value) => setValue('master-title', value)}
                  onCopy={() => copy('master-title', valueFor('master-title', item.master.title))}
                  copied={copied === 'master-title'}
                >
                  <DemoTextarea
                    label="Description"
                    value={valueFor('master-description', item.master.description)}
                    onChange={(value) => setValue('master-description', value)}
                    onCopy={() =>
                      copy('master-description', valueFor('master-description', item.master.description))
                    }
                    copied={copied === 'master-description'}
                  />
                </DemoField>
              ) : variant ? (
                <div className="space-y-4">
                  <Alert tone={variant.badge === 'DIRECT_PUBLISHING' ? 'success' : 'neutral'}>
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={variant.badge === 'DIRECT_PUBLISHING' ? 'accent' : 'neutral'}>
                        {variant.badge === 'DIRECT_PUBLISHING'
                          ? 'Direct publishing available'
                          : 'Export workflow'}
                      </Badge>
                      <span className="text-[13px]">
                        {variant.badge === 'DIRECT_PUBLISHING'
                          ? `Connect your ${variant.platformName} account and publish after a final confirmation.`
                          : `${variant.platformName} has no approved third-party listing API, so we prepare everything for a fast copy-and-paste.`}
                      </span>
                    </span>
                  </Alert>

                  <DemoField
                    label="Title"
                    value={valueFor(`${variant.platform}-title`, variant.title)}
                    max={variant.titleMaxLength}
                    onChange={(value) => setValue(`${variant.platform}-title`, value)}
                    onCopy={() =>
                      copy(
                        `${variant.platform}-title`,
                        valueFor(`${variant.platform}-title`, variant.title),
                      )
                    }
                    copied={copied === `${variant.platform}-title`}
                  >
                    <DemoTextarea
                      label="Description"
                      value={valueFor(`${variant.platform}-description`, variant.description)}
                      onChange={(value) => setValue(`${variant.platform}-description`, value)}
                      onCopy={() =>
                        copy(
                          `${variant.platform}-description`,
                          valueFor(`${variant.platform}-description`, variant.description),
                        )
                      }
                      copied={copied === `${variant.platform}-description`}
                    />
                  </DemoField>

                  {Object.keys(variant.fields).length > 0 ? (
                    <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-4">
                      <h3 className="text-[13px] font-semibold text-ink">
                        {variant.platformName} fields
                      </h3>
                      <dl className="mt-2 space-y-1.5">
                        {Object.entries(variant.fields).map(([key, value]) => (
                          <div key={key} className="flex items-baseline justify-between gap-4">
                            <dt className="text-[12px] text-muted">{humanize(key)}</dt>
                            <dd className="text-right text-[12px] font-medium text-ink">
                              {Array.isArray(value) ? value.join(' ') : value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null}

                  <div className="rounded-lg border border-dashed border-stone-300 p-4 text-center">
                    <Download className="mx-auto size-4 text-subtle" aria-hidden="true" />
                    <p className="mt-2 text-[13px] font-medium text-ink">Export preview</p>
                    <p className="mt-1 text-[12px] text-muted">
                      In the real product this downloads a photo ZIP in listing order plus the
                      listing as text, JSON or CSV. Downloads are disabled in the demo.
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Prices */}
              <div className="rounded-lg border border-stone-200 bg-paper p-4">
                <h3 className="text-[13px] font-semibold text-ink">Price suggestions</h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      ['Quick sale', item.prices.quickSale],
                      ['Balanced', item.prices.balanced],
                      ['Maximise return', item.prices.maximise],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-stone-200 p-3">
                      <p className="text-[12px] text-muted">{label}</p>
                      <p className="text-[17px] font-semibold tabular-nums text-ink">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-muted">{item.prices.basis}</p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>
          Back
        </Button>

        {step < 2 ? (
          <Button variant="primary" onClick={() => setStep((value) => value + 1)}>
            {step === 0 ? 'See what the AI found' : 'See the drafts'}
            <ArrowRight />
          </Button>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => { setStep(0); setEdits({}); }}>
              Start over
            </Button>
            <Button asChild variant="primary">
              <Link href="/register">
                Try it on your own item
                <ArrowRight />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function DemoField({
  label,
  value,
  max,
  onChange,
  onCopy,
  copied,
  children,
}: {
  label: string;
  value: string;
  max?: number;
  onChange: (value: string) => void;
  onCopy: () => void;
  copied: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink">{label}</span>
          <span className="flex items-center gap-2">
            {max ? (
              <span
                className={cn(
                  'text-[11px] tabular-nums',
                  value.length > max ? 'font-semibold text-danger' : 'text-subtle',
                )}
              >
                {value.length} / {max}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onCopy}
              className="rounded-md p-1.5 text-subtle hover:bg-stone-100 hover:text-ink"
              aria-label={`Copy ${label.toLowerCase()}`}
            >
              {copied ? (
                <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
            </button>
          </span>
        </div>
        <Input value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
      {children}
    </div>
  );
}

function DemoTextarea({
  label,
  value,
  onChange,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-md p-1.5 text-subtle hover:bg-stone-100 hover:text-ink"
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          {copied ? (
            <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
          ) : (
            <Copy className="size-3.5" aria-hidden="true" />
          )}
        </button>
      </div>
      <Textarea rows={8} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function humanize(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase());
}
