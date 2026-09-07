'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, X } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import { resolveInferenceAction } from '@/server/items/actions';
import { FACT_LABELS } from '@/server/items/facts';
import { cn } from '@/lib/utils';

export interface ReviewFact {
  key: string;
  value: string;
  source: string;
  confidence: string | null;
  evidence: string | null;
  confirmed: boolean;
}

const CONFIDENCE_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  HIGH: 'success',
  MEDIUM: 'warning',
  LOW: 'danger',
};

/**
 * The screen that keeps the product honest: a guess is displayed as a guess,
 * with the evidence behind it, until the seller explicitly accepts or edits it.
 */
export function FactReview({ itemId, facts }: { itemId: string; facts: ReviewFact[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();

  const confirmed = facts.filter((fact) => fact.source === 'SELLER_CONFIRMED');
  const inferred = facts.filter((fact) => fact.source === 'AI_INFERENCE');
  const questions = facts.filter((fact) => fact.source === 'NEEDS_CONFIRMATION');

  function resolve(key: string, action: 'accept' | 'edit' | 'clear', value?: string) {
    startTransition(async () => {
      await resolveInferenceAction({ itemId, key, action, value });
      setEditing(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {inferred.length > 0 ? (
        <section>
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-ink">
              Needs your confirmation ({inferred.length})
            </h3>
            <span className="text-[11px] text-muted">Seen in your photos, not confirmed</span>
          </div>

          <ul className="mt-3 space-y-2">
            {inferred.map((fact) => (
              <li
                key={fact.key}
                className={cn(
                  'rounded-lg border p-3',
                  fact.confidence === 'LOW'
                    ? 'border-danger/25 bg-danger-wash/40'
                    : 'border-stone-200 bg-paper',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-muted">
                      {FACT_LABELS[fact.key] ?? fact.key}
                    </p>
                    {editing === fact.key ? (
                      <Input
                        value={draft}
                        autoFocus
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') resolve(fact.key, 'edit', draft);
                          if (event.key === 'Escape') setEditing(null);
                        }}
                        className="mt-1 h-8"
                      />
                    ) : (
                      <p className="mt-0.5 text-[14px] font-medium text-ink">{fact.value}</p>
                    )}
                  </div>

                  {fact.confidence ? (
                    <Badge tone={CONFIDENCE_TONE[fact.confidence] ?? 'neutral'}>
                      {fact.confidence.toLowerCase()} confidence
                    </Badge>
                  ) : null}
                </div>

                {fact.evidence ? (
                  <p className="mt-1.5 text-[12px] italic leading-relaxed text-muted">
                    &ldquo;{fact.evidence}&rdquo;
                  </p>
                ) : null}

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {editing === fact.key ? (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={pending}
                        onClick={() => resolve(fact.key, 'edit', draft)}
                      >
                        <Check />
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => resolve(fact.key, 'accept')}
                      >
                        <Check />
                        That is right
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(fact.key);
                          setDraft(fact.value);
                        }}
                      >
                        <Pencil />
                        Correct it
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => resolve(fact.key, 'clear')}
                      >
                        <X />
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {questions.length > 0 ? (
        <section>
          <h3 className="text-[13px] font-semibold text-ink">Worth answering</h3>
          <ul className="mt-2 space-y-1.5">
            {questions.map((fact) => (
              <li key={fact.key} className="flex items-start justify-between gap-3">
                <p className="text-[13px] leading-relaxed text-muted">{fact.value}</p>
                <button
                  type="button"
                  onClick={() => resolve(fact.key, 'clear')}
                  className="shrink-0 text-[12px] text-subtle underline-offset-4 hover:text-ink hover:underline"
                >
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className="text-[13px] font-semibold text-ink">
          Confirmed by you ({confirmed.length})
        </h3>
        {confirmed.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">Nothing confirmed yet.</p>
        ) : (
          <dl className="mt-2 divide-y divide-stone-200 border-y border-stone-200">
            {confirmed.map((fact) => (
              <div key={fact.key} className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-[12px] text-muted">{FACT_LABELS[fact.key] ?? fact.key}</dt>
                <dd className="text-right text-[13px] font-medium text-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}
