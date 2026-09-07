'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import {
  Alert, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Field, Input, Textarea,
} from '@/components/ui';
import { updateAppSettingsAction } from '@/server/admin/actions';
import type { AppSettings } from '@/server/settings';

const GROUPS: Array<{ heading: string; keys: Array<keyof AppSettings> }> = [
  { heading: 'Brand and support', keys: ['brandName', 'supportEmail', 'defaultCurrency'] },
  {
    heading: 'Availability',
    keys: ['maintenanceMode', 'maintenanceMessage', 'demoVisible', 'homepageAnnouncement'],
  },
  { heading: 'AI controls', keys: ['aiGenerationEnabled', 'aiDailyCostLimitCents'] },
  { heading: 'Uploads', keys: ['maxPhotosPerItem', 'maxUploadBytes'] },
  {
    heading: 'Retention',
    keys: ['deletedItemRetentionDays', 'failedUploadRetentionHours', 'exportArtifactRetentionHours'],
  },
  {
    heading: 'Credits and metrics',
    keys: ['signupFreeCredits', 'lowCreditThreshold', 'timeSavedMinutesPerListing'],
  },
];

export function SettingsForm({
  settings,
  descriptions,
}: {
  settings: AppSettings;
  descriptions: Record<keyof AppSettings, string>;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);

        const patch: Partial<AppSettings> = {};
        for (const group of GROUPS) {
          for (const key of group.keys) {
            const current = settings[key];
            if (typeof current === 'boolean') {
              (patch as Record<string, unknown>)[key] = formData.get(key) === 'on';
            } else if (typeof current === 'number') {
              (patch as Record<string, unknown>)[key] = Number(formData.get(key));
            } else {
              (patch as Record<string, unknown>)[key] = String(formData.get(key) ?? '');
            }
          }
        }

        startTransition(async () => {
          const result = await updateAppSettingsAction(patch);
          if (result.ok) {
            setSaved(true);
            setError(null);
            router.refresh();
            setTimeout(() => setSaved(false), 3000);
          } else {
            setError(result.error ?? 'Could not save settings.');
          }
        });
      }}
    >
      {saved ? <Alert tone="success">Settings saved and applied.</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {GROUPS.map((group) => (
        <Card key={group.heading}>
          <CardHeader>
            <CardTitle>{group.heading}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {group.keys.map((key) => {
              const value = settings[key];
              const description = descriptions[key];

              if (typeof value === 'boolean') {
                return (
                  <div key={String(key)}>
                    <label className="flex items-center gap-2.5 text-[13px] font-medium text-ink">
                      <Checkbox name={String(key)} defaultChecked={value} />
                      {humanize(String(key))}
                    </label>
                    <p className="ml-6.5 mt-1 text-[12px] leading-relaxed text-muted">
                      {description}
                    </p>
                  </div>
                );
              }

              if (typeof value === 'number') {
                return (
                  <Field
                    key={String(key)}
                    label={humanize(String(key))}
                    htmlFor={String(key)}
                    hint={description}
                  >
                    <Input id={String(key)} name={String(key)} type="number" defaultValue={value} />
                  </Field>
                );
              }

              const isLong = String(key).toLowerCase().includes('message') ||
                String(key).toLowerCase().includes('announcement');

              return (
                <Field
                  key={String(key)}
                  label={humanize(String(key))}
                  htmlFor={String(key)}
                  hint={description}
                >
                  {isLong ? (
                    <Textarea id={String(key)} name={String(key)} rows={2} defaultValue={value} />
                  ) : (
                    <Input id={String(key)} name={String(key)} defaultValue={value} />
                  )}
                </Field>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <Button type="submit" variant="primary" disabled={pending}>
        <Save />
        {pending ? 'Saving…' : 'Save all settings'}
      </Button>
    </form>
  );
}

function humanize(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (character) => character.toUpperCase())
    .replace(/\bCents\b/, '(cents)')
    .replace(/\bBytes\b/, '(bytes)')
    .replace(/\bDays\b/, '(days)')
    .replace(/\bHours\b/, '(hours)')
    .replace(/\bMinutes\b/, '(minutes)');
}
