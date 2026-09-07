'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Card, CardContent, Checkbox } from '@/components/ui';
import { updateFeatureFlagAction } from '@/server/admin/actions';

export function FlagEditor({
  flag,
  plans,
}: {
  flag: { key: string; description: string; enabled: boolean; planKeys: string[] };
  plans: Array<{ key: string; name: string }>;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(flag.enabled);
  const [planKeys, setPlanKeys] = useState<string[]>(flag.planKeys);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty =
    enabled !== flag.enabled ||
    planKeys.length !== flag.planKeys.length ||
    planKeys.some((key) => !flag.planKeys.includes(key));

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2">
              <code className="text-[13px] font-medium text-ink">{flag.key}</code>
              <Badge tone={flag.enabled ? 'success' : 'neutral'}>
                {flag.enabled ? 'on' : 'off'}
              </Badge>
            </p>
            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted">
              {flag.description}
            </p>
          </div>

          <label className="flex shrink-0 items-center gap-2 text-[13px] text-ink">
            <Checkbox checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            Enabled
          </label>
        </div>

        <fieldset className="mt-3 border-t border-stone-200 pt-3">
          <legend className="text-[12px] font-medium text-ink">
            Limit to plans{' '}
            <span className="font-normal text-muted">(leave all unchecked for every plan)</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {plans.map((plan) => (
              <label key={plan.key} className="flex items-center gap-1.5 text-[12px] text-muted">
                <Checkbox
                  checked={planKeys.includes(plan.key)}
                  onChange={(event) =>
                    setPlanKeys((current) =>
                      event.target.checked
                        ? [...current, plan.key]
                        : current.filter((key) => key !== plan.key),
                    )
                  }
                />
                {plan.name}
              </label>
            ))}
          </div>
        </fieldset>

        {error ? (
          <Alert tone="danger" className="mt-3">
            {error}
          </Alert>
        ) : null}

        {dirty ? (
          <Button
            variant="primary"
            size="sm"
            className="mt-3"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await updateFeatureFlagAction({ key: flag.key, enabled, planKeys });
                if (result.ok) router.refresh();
                else setError(result.error ?? 'Could not save.');
              })
            }
          >
            {pending ? 'Saving…' : 'Save flag'}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
