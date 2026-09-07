'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Alert, Button, Card, CardContent, Field, Input, Textarea } from '@/components/ui';

/**
 * Confirmation dialog for a privileged action.
 *
 * Two safeguards, both deliberate: the dialog names the exact target so an
 * operator cannot act on the wrong row, and a reason is mandatory because
 * every one of these writes an audit entry that someone will read later.
 */
export function ConfirmAction({
  label,
  title,
  description,
  targetName,
  confirmLabel,
  variant = 'danger',
  requireReason = true,
  requireTypedConfirmation = false,
  size = 'sm',
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  targetName: string;
  confirmLabel: string;
  variant?: 'danger' | 'primary' | 'outline';
  requireReason?: boolean;
  requireTypedConfirmation?: boolean;
  size?: 'sm' | 'md';
  onConfirm: (reason: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm =
    (!requireReason || reason.trim().length >= 3) &&
    (!requireTypedConfirmation || typed.trim() === targetName);

  if (!open) {
    return (
      <Button variant={variant === 'danger' ? 'ghost' : variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <Card className={variant === 'danger' ? 'border-danger' : 'border-ink'}>
      <CardContent className="p-4">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          {variant === 'danger' ? (
            <AlertTriangle className="size-4 text-danger" aria-hidden="true" />
          ) : null}
          {title}
        </p>

        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{description}</p>

        <p className="mt-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-[13px] font-medium text-ink">
          {targetName}
        </p>

        {error ? (
          <Alert tone="danger" className="mt-3">
            {error}
          </Alert>
        ) : null}

        <div className="mt-3 space-y-3">
          {requireReason ? (
            <Field
              label="Reason"
              htmlFor="confirm-reason"
              required
              hint="Recorded in the audit log against your account."
            >
              <Textarea
                id="confirm-reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                autoFocus
              />
            </Field>
          ) : null}

          {requireTypedConfirmation ? (
            <Field
              label={`Type "${targetName}" to confirm`}
              htmlFor="confirm-typed"
              required
            >
              <Input
                id="confirm-typed"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
            </Field>
          ) : null}
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            variant={variant}
            size="sm"
            disabled={pending || !canConfirm}
            onClick={async () => {
              setPending(true);
              setError(null);
              const result = await onConfirm(reason);
              if (result.ok) {
                setOpen(false);
                setReason('');
                setTyped('');
                router.refresh();
              } else {
                setError(result.error ?? 'That action failed.');
              }
              setPending(false);
            }}
          >
            {pending ? 'Working…' : confirmLabel}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
