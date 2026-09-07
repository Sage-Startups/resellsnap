'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, MessageSquarePlus } from 'lucide-react';
import { Alert, Button, Card, CardContent, Field, Select, Textarea } from '@/components/ui';
import { ConfirmAction } from '@/components/admin/confirm-action';
import {
  addSupportNoteAction, adjustCreditsAction, sendPasswordResetAction,
  setUserRoleAction, setUserStatusAction,
} from '@/server/admin/actions';
import type { Role, UserStatus } from '@/lib/enums';

export function UserControls({
  userId,
  userName,
  userEmail,
  role,
  status,
  workspaceId,
  canChangeRole,
  canSuspend,
  canAdjustCredits,
}: {
  userId: string;
  userName: string;
  userEmail: string;
  role: Role;
  status: UserStatus;
  workspaceId: string | null;
  canChangeRole: boolean;
  canSuspend: boolean;
  canAdjustCredits: boolean;
}) {
  const router = useRouter();
  const [nextRole, setNextRole] = useState<Role>(role);
  const [resetSent, setResetSent] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      {/* Password reset */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-[14px] font-semibold text-ink">Password reset</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            Sends a reset link to {userEmail}. Nobody here ever sees the token, and we never set a
            password on a customer&rsquo;s behalf.
          </p>
          {resetSent ? (
            <Alert tone="success" className="mt-3">
              Reset email sent to {userEmail}.
            </Alert>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await sendPasswordResetAction(userId);
                  if (result.ok) setResetSent(true);
                })
              }
            >
              <KeyRound />
              Send reset email
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Suspension */}
      {canSuspend ? (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-[14px] font-semibold text-ink">
              {status === 'SUSPENDED' ? 'Reactivate account' : 'Suspend account'}
            </h3>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              {status === 'SUSPENDED'
                ? 'Restores access immediately. The user can sign in again straight away.'
                : 'Blocks sign-in and ends every active session for this account. Their data is untouched.'}
            </p>
            <div className="mt-3">
              <ConfirmAction
                label={status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                title={status === 'SUSPENDED' ? 'Reactivate this account?' : 'Suspend this account?'}
                description={
                  status === 'SUSPENDED'
                    ? 'The user will be able to sign in again immediately.'
                    : 'The user will be signed out everywhere and unable to sign in until reactivated.'
                }
                targetName={`${userName} · ${userEmail}`}
                confirmLabel={status === 'SUSPENDED' ? 'Reactivate account' : 'Suspend account'}
                variant={status === 'SUSPENDED' ? 'primary' : 'danger'}
                onConfirm={async (reason) =>
                  setUserStatusAction({
                    userId,
                    status: status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
                    reason,
                  })
                }
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Role */}
      {canChangeRole ? (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-[14px] font-semibold text-ink">Role</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Staff roles unlock the admin console. Grant the lowest role that does the job.
            </p>
            <div className="mt-3 space-y-3">
              <Field label="New role" htmlFor="user-role">
                <Select
                  id="user-role"
                  value={nextRole}
                  onChange={(event) => setNextRole(event.target.value as Role)}
                >
                  <option value="USER">User — customer access only</option>
                  <option value="SUPPORT">Support — read admin, send resets, add notes</option>
                  <option value="ADMIN">Admin — most operational controls</option>
                  <option value="SUPER_ADMIN">Super admin — everything, including roles</option>
                </Select>
              </Field>

              {nextRole !== role ? (
                <ConfirmAction
                  label="Change role"
                  title="Change this account's role?"
                  description={`This moves the account from ${role.replace('_', ' ').toLowerCase()} to ${nextRole.replace('_', ' ').toLowerCase()}. Staff roles can see and change other customers' data.`}
                  targetName={`${userName} · ${userEmail}`}
                  confirmLabel="Change role"
                  variant="danger"
                  requireTypedConfirmation={nextRole === 'SUPER_ADMIN'}
                  onConfirm={async (reason) =>
                    setUserRoleAction({ userId, role: nextRole, reason })
                  }
                />
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Credits */}
      {canAdjustCredits && workspaceId ? (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-[14px] font-semibold text-ink">Adjust credits</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Writes an entry to the append-only ledger. Nothing is ever edited or deleted — a
              mistake is corrected with a compensating entry.
            </p>

            <form
              className="mt-3 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                const form = event.currentTarget;
                startTransition(async () => {
                  const result = await adjustCreditsAction({
                    workspaceId,
                    amount: Number(formData.get('amount')),
                    bucket: String(formData.get('bucket')),
                    reason: String(formData.get('reason')),
                  });
                  if (result.ok) {
                    form.reset();
                    router.refresh();
                  }
                });
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Amount" htmlFor="credit-amount" required hint="Negative to reverse.">
                  <input
                    id="credit-amount"
                    name="amount"
                    type="number"
                    required
                    className="h-10 w-full rounded-lg border border-stone-300 bg-paper px-3 text-sm"
                  />
                </Field>
                <Field label="Bucket" htmlFor="credit-bucket" required>
                  <Select id="credit-bucket" name="bucket" defaultValue="PURCHASED">
                    <option value="PURCHASED">Purchased (does not expire)</option>
                    <option value="MONTHLY">Monthly (resets on renewal)</option>
                  </Select>
                </Field>
              </div>

              <Field label="Reason" htmlFor="credit-reason" required>
                <Textarea id="credit-reason" name="reason" rows={2} required minLength={3} />
              </Field>

              <Button type="submit" variant="primary" size="sm" disabled={pending}>
                {pending ? 'Applying…' : 'Apply adjustment'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Support note */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-[14px] font-semibold text-ink">Add a support note</h3>
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const body = String(new FormData(form).get('body') ?? '');
              startTransition(async () => {
                const result = await addSupportNoteAction({ userId, body });
                if (result.ok) {
                  form.reset();
                  router.refresh();
                }
              });
            }}
          >
            <Field label="Note" htmlFor="support-note" required>
              <Textarea
                id="support-note"
                name="body"
                rows={3}
                required
                placeholder="Context that the next person handling this account should know."
              />
            </Field>
            <Button type="submit" variant="outline" size="sm" disabled={pending}>
              <MessageSquarePlus />
              {pending ? 'Saving…' : 'Add note'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
