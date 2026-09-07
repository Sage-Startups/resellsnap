import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { FlagEditor } from './flag-editor';
import { prisma } from '@/lib/db';
import { requireStaff } from '@/server/session';
import { Role } from '@/generated/prisma/enums';

export const metadata: Metadata = { title: 'Feature flags' };

export default async function AdminFlagsPage() {
  await requireStaff(Role.ADMIN);

  const [flags, plans] = await Promise.all([
    prisma.featureFlag.findMany({ orderBy: { key: 'asc' } }),
    prisma.plan.findMany({ orderBy: { sortOrder: 'asc' }, select: { key: true, name: true } }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Feature flags"
        description="Global switches, optionally limited to specific plans. Every flag has a safe default and a description of what turning it off actually does."
      />

      <div className="space-y-3">
        {flags.map((flag) => (
          <FlagEditor
            key={flag.key}
            flag={{
              key: flag.key,
              description: flag.description,
              enabled: flag.enabled,
              planKeys: Array.isArray(flag.planKeys) ? (flag.planKeys as string[]) : [],
            }}
            plans={plans}
          />
        ))}
      </div>
    </div>
  );
}
