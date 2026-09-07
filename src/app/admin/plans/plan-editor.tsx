'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Field, Input, Textarea,
} from '@/components/ui';
import { updatePlanAction } from '@/server/admin/actions';
import { formatMoney } from '@/lib/money';

export interface PlanData {
  id: string;
  key: string;
  name: string;
  kind: string;
  tagline: string | null;
  description: string | null;
  priceCents: number;
  currency: string;
  interval: string | null;
  creditsGranted: number;
  stripePriceId: string | null;
  isVisible: boolean;
  features: string[];
  subscriberCount: number;
  entitlements: Array<{ key: string; value: string }>;
}

export function PlanEditor({ plan }: { plan: PlanData }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{plan.name}</CardTitle>
        <span className="flex flex-wrap gap-1.5">
          <Badge tone="neutral">{plan.kind.toLowerCase().replace('_', ' ')}</Badge>
          <Badge tone="neutral">{formatMoney(plan.priceCents, plan.currency)}</Badge>
          {plan.subscriberCount > 0 ? (
            <Badge tone="info">{plan.subscriberCount} subscribers</Badge>
          ) : null}
          {plan.stripePriceId ? (
            <Badge tone="success">price mapped</Badge>
          ) : plan.priceCents > 0 ? (
            <Badge tone="warning">no Stripe price</Badge>
          ) : null}
        </span>
      </CardHeader>

      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await updatePlanAction({
                planId: plan.id,
                name: String(formData.get('name')),
                tagline: String(formData.get('tagline')) || null,
                description: String(formData.get('description')) || null,
                creditsGranted: Number(formData.get('creditsGranted')),
                stripePriceId: String(formData.get('stripePriceId')) || null,
                isVisible: formData.get('isVisible') === 'on',
                features: String(formData.get('features'))
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean),
              });
              if (result.ok) {
                setState('saved');
                router.refresh();
                setTimeout(() => setState('idle'), 2500);
              } else {
                setState('error');
                setError(result.error ?? 'Could not save.');
              }
            });
          }}
        >
          {state === 'saved' ? <Alert tone="success">Plan saved.</Alert> : null}
          {state === 'error' ? <Alert tone="danger">{error}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Display name" htmlFor={`name-${plan.id}`} required>
              <Input id={`name-${plan.id}`} name="name" defaultValue={plan.name} required />
            </Field>
            <Field
              label="Credits granted"
              htmlFor={`credits-${plan.id}`}
              required
              hint={plan.interval ? 'Per billing period.' : 'One time.'}
            >
              <Input
                id={`credits-${plan.id}`}
                name="creditsGranted"
                type="number"
                min={0}
                defaultValue={plan.creditsGranted}
                required
              />
            </Field>
          </div>

          <Field label="Tagline" htmlFor={`tagline-${plan.id}`}>
            <Input id={`tagline-${plan.id}`} name="tagline" defaultValue={plan.tagline ?? ''} />
          </Field>

          <Field label="Description" htmlFor={`description-${plan.id}`}>
            <Textarea
              id={`description-${plan.id}`}
              name="description"
              rows={2}
              defaultValue={plan.description ?? ''}
            />
          </Field>

          <Field
            label="Stripe Price ID"
            htmlFor={`price-${plan.id}`}
            hint="This decides what is actually charged. Copy it from the Stripe dashboard; we never create Stripe products from code."
          >
            <Input
              id={`price-${plan.id}`}
              name="stripePriceId"
              defaultValue={plan.stripePriceId ?? ''}
              placeholder="price_..."
              className="font-mono text-[12px]"
            />
          </Field>

          <Field
            label="Features (one per line)"
            htmlFor={`features-${plan.id}`}
            hint="Shown on the pricing page and the billing screen."
          >
            <Textarea
              id={`features-${plan.id}`}
              name="features"
              rows={5}
              defaultValue={plan.features.join('\n')}
            />
          </Field>

          <label className="flex items-center gap-2.5 text-[13px] text-ink">
            <Checkbox name="isVisible" defaultChecked={plan.isVisible} />
            Visible on the pricing page and in billing
          </label>

          {plan.entitlements.length > 0 ? (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <p className="text-[12px] font-semibold text-ink">Entitlements</p>
              <dl className="mt-1.5 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {plan.entitlements.map((entitlement) => (
                  <div key={entitlement.key} className="flex justify-between gap-3">
                    <dt className="text-[11px] text-muted">{entitlement.key}</dt>
                    <dd className="text-[11px] font-medium text-ink">{entitlement.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          <Button type="submit" variant="primary" size="sm" disabled={pending}>
            <Save />
            {pending ? 'Saving…' : 'Save plan'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
