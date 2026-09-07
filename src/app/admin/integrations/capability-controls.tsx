'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Checkbox } from '@/components/ui';
import { ConfirmAction } from '@/components/admin/confirm-action';
import { updatePlatformCapabilityAction } from '@/server/admin/actions';

const FLAGS = [
  { key: 'canConnect', label: 'Connect account' },
  { key: 'canPublish', label: 'Publish' },
  { key: 'canUpdate', label: 'Update' },
  { key: 'canEnd', label: 'End listing' },
  { key: 'canReadOrders', label: 'Read orders' },
  { key: 'canFetchComparables', label: 'Fetch comparables' },
] as const;

export function CapabilityControls({
  capabilityId,
  platformName,
  capability,
}: {
  capabilityId: string;
  platformName: string;
  capability: Record<string, boolean>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(capability);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dirty = FLAGS.some((flag) => draft[flag.key] !== capability[flag.key]);

  return (
    <div className="w-full shrink-0 space-y-3 sm:w-64">
      <fieldset>
        <legend className="text-[12px] font-semibold text-ink">Capabilities</legend>
        <ul className="mt-2 space-y-1.5">
          {FLAGS.map((flag) => (
            <li key={flag.key}>
              <label className="flex items-center gap-2 text-[12px] text-ink">
                <Checkbox
                  checked={draft[flag.key] ?? false}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [flag.key]: event.target.checked }))
                  }
                />
                {flag.label}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {dirty ? (
        <ConfirmAction
          label="Save capabilities"
          title={`Change what ${platformName} can do?`}
          description="This immediately changes what every customer sees. Enabling publishing for a platform with no approved adapter will not make publishing work — it will only confuse sellers."
          targetName={platformName}
          confirmLabel="Save capabilities"
          variant="primary"
          onConfirm={async (reason) =>
            updatePlatformCapabilityAction({ capabilityId, patch: draft, reason })
          }
        />
      ) : null}

      <div className="border-t border-stone-200 pt-3">
        {capability.killSwitch ? (
          <Button
            variant="outline"
            size="sm"
            full
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await updatePlatformCapabilityAction({
                  capabilityId,
                  patch: { killSwitch: false },
                  reason: 'Kill switch released from the admin console',
                });
                if (!result.ok) setError(result.error ?? 'Could not release.');
                else router.refresh();
              })
            }
          >
            Release kill switch
          </Button>
        ) : (
          <ConfirmAction
            label="Throw kill switch"
            title={`Disable ${platformName} entirely?`}
            description="Every action for this platform stops immediately for every customer, including any publish already queued. Exports for other platforms are unaffected. Use this during an incident."
            targetName={platformName}
            confirmLabel="Disable the platform"
            variant="danger"
            onConfirm={async (reason) =>
              updatePlatformCapabilityAction({
                capabilityId,
                patch: { killSwitch: true, unavailableReason: reason },
                reason,
              })
            }
          />
        )}
      </div>
    </div>
  );
}
