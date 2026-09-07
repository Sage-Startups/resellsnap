import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/admin-shell';
import { requireStaff } from '@/server/session';
import { getEnv } from '@/lib/env';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · ResellSnap Admin' },
  // The admin console must never appear in a search index.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Guard for the entire admin tree.
 *
 * `requireStaff` redirects anyone below SUPPORT to `/app` before a single
 * child renders. Individual pages tighten this further where a section needs
 * ADMIN or SUPER_ADMIN.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const env = getEnv();

  return (
    <AdminShell
      actorName={user.name}
      actorRole={user.role.replace('_', ' ').toLowerCase()}
      environment={env.isProduction ? 'production' : 'development'}
    >
      {children}
    </AdminShell>
  );
}
