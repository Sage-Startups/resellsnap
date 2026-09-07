'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Download } from 'lucide-react';
import {
  Alert, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Field, Input, Select, Textarea,
} from '@/components/ui';
import {
  cancelAccountDeletionAction,
  changePasswordAction,
  exportAccountDataAction,
  requestAccountDeletionAction,
  revokeOtherSessionsAction,
  updateNotificationsAction,
  updateProfileAction,
} from '@/server/account/actions';

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
  'Australia/Sydney', 'Asia/Tokyo', 'Asia/Singapore',
];

function useSaveState() {
  const [state, setState] = useState<{ status: 'idle' | 'saving' | 'saved' | 'error'; message?: string }>({
    status: 'idle',
  });
  return [state, setState] as const;
}

export function ProfileForm({
  name,
  timezone,
  locale,
  defaultTone,
  brandVoice,
  measurementUnit,
  canSaveBrandVoice,
}: {
  name: string;
  timezone: string;
  locale: string;
  defaultTone: string;
  brandVoice: string;
  measurementUnit: string;
  canSaveBrandVoice: boolean;
}) {
  const [state, setState] = useSaveState();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            setState({ status: 'saving' });
            const result = await updateProfileAction({
              name: String(formData.get('name') ?? ''),
              timezone: String(formData.get('timezone') ?? 'UTC'),
              locale: String(formData.get('locale') ?? 'en-US'),
              defaultTone: String(formData.get('defaultTone') ?? 'STRAIGHTFORWARD'),
              brandVoice: canSaveBrandVoice ? String(formData.get('brandVoice') ?? '') : null,
              measurementUnit: String(formData.get('measurementUnit') ?? 'in'),
            });
            setState(
              result.ok
                ? { status: 'saved' }
                : { status: 'error', message: result.error },
            );
          }}
        >
          {state.status === 'error' ? <Alert tone="danger">{state.message}</Alert> : null}
          {state.status === 'saved' ? <Alert tone="success">Profile saved.</Alert> : null}

          <Field label="Your name" htmlFor="profile-name" required>
            <Input id="profile-name" name="name" defaultValue={name} required />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Timezone" htmlFor="profile-timezone">
              <Select id="profile-timezone" name="timezone" defaultValue={timezone}>
                {TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Locale" htmlFor="profile-locale">
              <Select id="profile-locale" name="locale" defaultValue={locale}>
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="en-AU">English (Australia)</option>
              </Select>
            </Field>

            <Field label="Default tone" htmlFor="profile-tone">
              <Select id="profile-tone" name="defaultTone" defaultValue={defaultTone}>
                <option value="STRAIGHTFORWARD">Straightforward</option>
                <option value="FRIENDLY">Friendly</option>
                <option value="VINTAGE">Vintage</option>
                <option value="MINIMAL">Minimal</option>
              </Select>
            </Field>

            <Field label="Measurement units" htmlFor="profile-units">
              <Select id="profile-units" name="measurementUnit" defaultValue={measurementUnit}>
                <option value="in">Inches</option>
                <option value="cm">Centimetres</option>
              </Select>
            </Field>
          </div>

          <Field
            label="Saved brand voice"
            htmlFor="profile-voice"
            hint={
              canSaveBrandVoice
                ? 'Applied to every listing you generate. Describe how you write, not what to claim.'
                : 'A saved brand voice is available on the Pro plan.'
            }
          >
            <Textarea
              id="profile-voice"
              name="brandVoice"
              rows={3}
              defaultValue={brandVoice}
              disabled={!canSaveBrandVoice}
              placeholder="e.g. Warm and concise. Mention fit and feel. Never use exclamation marks."
            />
          </Field>

          <Button type="submit" variant="primary" disabled={state.status === 'saving'}>
            {state.status === 'saving' ? 'Saving…' : 'Save profile'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function NotificationForm({
  preferences,
}: {
  preferences: {
    emailGenerationComplete: boolean;
    emailGenerationFailed: boolean;
    emailLowCredits: boolean;
    emailProductUpdates: boolean;
    inAppEnabled: boolean;
  };
}) {
  const [state, setState] = useSaveState();

  const rows = [
    { key: 'emailGenerationComplete', label: 'Email me when a listing is ready' },
    { key: 'emailGenerationFailed', label: 'Email me if a generation fails' },
    { key: 'emailLowCredits', label: 'Email me when credits run low' },
    { key: 'emailProductUpdates', label: 'Occasional product updates' },
    { key: 'inAppEnabled', label: 'Show in-app notifications' },
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            setState({ status: 'saving' });
            const result = await updateNotificationsAction(
              Object.fromEntries(rows.map((row) => [row.key, formData.get(row.key) === 'on'])),
            );
            setState(result.ok ? { status: 'saved' } : { status: 'error', message: result.error });
          }}
        >
          {state.status === 'saved' ? <Alert tone="success">Preferences saved.</Alert> : null}
          {state.status === 'error' ? <Alert tone="danger">{state.message}</Alert> : null}

          <ul className="space-y-2.5">
            {rows.map((row) => (
              <li key={row.key}>
                <label className="flex items-center gap-2.5 text-[13px] text-ink">
                  <Checkbox name={row.key} defaultChecked={preferences[row.key]} />
                  {row.label}
                </label>
              </li>
            ))}
          </ul>

          <p className="text-[12px] leading-relaxed text-muted">
            Security and billing emails are always sent — they are not marketing, and turning them
            off would leave you unable to recover your account or fix a failed payment.
          </p>

          <Button type="submit" variant="primary" disabled={state.status === 'saving'}>
            {state.status === 'saving' ? 'Saving…' : 'Save preferences'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function SecurityForm({ otherSessions }: { otherSessions: number }) {
  const router = useRouter();
  const [state, setState] = useSaveState();
  const [revoking, setRevoking] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password and sessions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="space-y-4"
          method="post"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            const next = String(formData.get('newPassword') ?? '');
            const confirm = String(formData.get('confirmPassword') ?? '');

            if (next !== confirm) {
              setState({ status: 'error', message: 'Those new passwords do not match.' });
              return;
            }

            setState({ status: 'saving' });
            const result = await changePasswordAction({
              currentPassword: String(formData.get('currentPassword') ?? ''),
              newPassword: next,
              revokeOtherSessions: formData.get('revokeOthers') === 'on',
            });

            if (result.ok) {
              form.reset();
              setState({ status: 'saved' });
            } else {
              setState({ status: 'error', message: result.error });
            }
          }}
        >
          {state.status === 'saved' ? <Alert tone="success">Password updated.</Alert> : null}
          {state.status === 'error' ? <Alert tone="danger">{state.message}</Alert> : null}

          <Field label="Current password" htmlFor="current-password" required>
            <Input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password" htmlFor="new-password" required hint="At least 10 characters.">
              <Input
                id="new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
              />
            </Field>
            <Field label="Confirm new password" htmlFor="confirm-password" required>
              <Input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
              />
            </Field>
          </div>

          <label className="flex items-center gap-2.5 text-[13px] text-ink">
            <Checkbox name="revokeOthers" defaultChecked />
            Sign out everywhere else
          </label>

          <Button type="submit" variant="primary" disabled={state.status === 'saving'}>
            {state.status === 'saving' ? 'Updating…' : 'Change password'}
          </Button>
        </form>

        <div className="border-t border-stone-200 pt-4">
          <p className="text-[13px] font-medium text-ink">
            {otherSessions === 0
              ? 'No other active sessions'
              : `${otherSessions} other active ${otherSessions === 1 ? 'session' : 'sessions'}`}
          </p>
          <p className="mt-1 text-[12px] text-muted">
            Signing out everywhere else ends every session except this one.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={revoking || otherSessions === 0}
            onClick={async () => {
              setRevoking(true);
              await revokeOtherSessionsAction();
              router.refresh();
              setRevoking(false);
            }}
          >
            {revoking ? 'Signing out…' : 'Sign out other sessions'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function DataControls({ deletionRequested }: { deletionRequested: string | null }) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-[13px] font-medium text-ink">Export everything</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            A JSON file with your account, items, confirmed facts, generated listings, prices and
            credit history. Photos are referenced by key — download them from each item.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              setError(null);
              const result = await exportAccountDataAction();
              if (result.ok && result.data) {
                const blob = new Blob([result.data.json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `resellsnap-export-${new Date().toISOString().slice(0, 10)}.json`;
                anchor.click();
                URL.revokeObjectURL(url);
              } else {
                setError(result.error ?? 'Could not build your export.');
              }
              setExporting(false);
            }}
          >
            <Download />
            {exporting ? 'Building…' : 'Download my data'}
          </Button>
        </div>

        <div className="border-t border-stone-200 pt-4">
          {deletionRequested ? (
            <Alert tone="warning" title="Deletion requested">
              <p>
                You asked us to delete this account on{' '}
                {new Date(deletionRequested).toLocaleDateString()}. It will be removed after the
                grace period. You can still change your mind.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  await cancelAccountDeletionAction();
                  router.refresh();
                  setPending(false);
                }}
              >
                {pending ? 'Cancelling…' : 'Cancel the deletion request'}
              </Button>
            </Alert>
          ) : confirming ? (
            <form
              className="space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                const reason = String(new FormData(event.currentTarget).get('reason') ?? '');
                setPending(true);
                const result = await requestAccountDeletionAction(reason);
                if (!result.ok) setError(result.error ?? 'Could not record that request.');
                else router.refresh();
                setPending(false);
              }}
            >
              <Alert tone="danger" title="Delete this account">
                Your items, photos and generated listings will be permanently removed after the
                grace period. Billing records are kept only where the law requires it. This cannot
                be undone once the grace period ends.
              </Alert>

              <Field
                label="Why are you leaving?"
                htmlFor="deletion-reason"
                hint="Optional, but it genuinely helps us improve."
              >
                <Textarea id="deletion-reason" name="reason" rows={2} />
              </Field>

              <div className="flex gap-2">
                <Button type="submit" variant="danger" size="sm" disabled={pending}>
                  {pending ? 'Submitting…' : 'Request deletion'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <>
              <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
                <AlertTriangle className="size-3.5 text-danger" aria-hidden="true" />
                Delete this account
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                Removes your account, items and photos after a grace period during which you can
                change your mind.
              </p>
              <Button variant="ghost" size="sm" className="mt-3 text-danger" onClick={() => setConfirming(true)}>
                Request account deletion
              </Button>
            </>
          )}
        </div>

        {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
