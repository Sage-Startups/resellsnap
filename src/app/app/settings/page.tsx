import type { Metadata } from 'next';
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from '@/components/ui';
import {
  DataControls, NotificationForm, ProfileForm, SecurityForm,
} from './settings-forms';
import { prisma } from '@/lib/db';
import { requireWorkspace } from '@/server/session';
import { getEntitlements } from '@/server/entitlements';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const context = await requireWorkspace();

  const [preference, notifications, sessionCount, user, entitlements] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId: context.user.id } }),
    prisma.notificationPreference.findUnique({ where: { userId: context.user.id } }),
    prisma.session.count({
      where: { userId: context.user.id, expiresAt: { gt: new Date() } },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: context.user.id },
      select: { deletionRequested: true, createdAt: true },
    }),
    getEntitlements(context.workspace.id),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Your profile, how we contact you, your password, and control over your data."
      />

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {(
              [
                ['Email', context.user.email],
                ['Workspace', context.workspace.name],
                ['Currency', context.workspace.currency],
                ['Member since', formatDate(user.createdAt)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4">
                <dt className="text-[13px] text-muted">{label}</dt>
                <dd className="text-[13px] font-medium text-ink">{value}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[13px] text-muted">Email verified</dt>
              <dd>
                {context.user.emailVerified ? (
                  <Badge tone="success">Verified</Badge>
                ) : (
                  <Badge tone="warning">Not verified</Badge>
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-[12px] text-muted">
            Changing your email address is not self-service yet — contact support and we will move
            it for you, after verifying you own both addresses.
          </p>
        </CardContent>
      </Card>

      <ProfileForm
        name={context.user.name}
        timezone={preference?.timezone ?? 'UTC'}
        locale={preference?.locale ?? 'en-US'}
        defaultTone={preference?.defaultTone ?? 'STRAIGHTFORWARD'}
        brandVoice={preference?.brandVoice ?? ''}
        measurementUnit={preference?.measurementUnit ?? 'in'}
        canSaveBrandVoice={entitlements.savedBrandVoice === true}
      />

      <NotificationForm
        preferences={{
          emailGenerationComplete: notifications?.emailGenerationComplete ?? true,
          emailGenerationFailed: notifications?.emailGenerationFailed ?? true,
          emailLowCredits: notifications?.emailLowCredits ?? true,
          emailProductUpdates: notifications?.emailProductUpdates ?? false,
          inAppEnabled: notifications?.inAppEnabled ?? true,
        }}
      />

      <SecurityForm otherSessions={Math.max(0, sessionCount - 1)} />

      <DataControls
        deletionRequested={user.deletionRequested?.toISOString() ?? null}
      />
    </div>
  );
}
