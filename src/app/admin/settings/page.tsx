import type { Metadata } from 'next';
import { Alert, PageHeader } from '@/components/ui';
import { SettingsForm } from './settings-form';
import { requireStaff } from '@/server/session';
import { Role } from '@/generated/prisma/enums';
import { getSettings, SETTING_DESCRIPTIONS } from '@/server/settings';

export const metadata: Metadata = { title: 'Settings' };

export default async function AdminSettingsPage() {
  await requireStaff(Role.SUPER_ADMIN);
  const settings = await getSettings();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="Operational configuration that takes effect without a redeploy."
      />

      <Alert tone="neutral">
        Secrets live in environment variables and are never editable or visible here. This screen
        controls behaviour, limits and retention only.
      </Alert>

      <SettingsForm settings={settings} descriptions={SETTING_DESCRIPTIONS} />
    </div>
  );
}
