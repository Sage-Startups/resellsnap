import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthCard, AuthFooterLink } from '@/components/auth/auth-card';
import { Skeleton } from '@/components/ui';
import { getCurrentUser } from '@/server/session';
import { VerifyEmailPanel } from './verify-email-panel';

export const metadata: Metadata = {
  title: 'Confirm your email',
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage() {
  const user = await getCurrentUser();

  return (
    <AuthCard
      title="Confirm your email"
      description="One click and your account is ready."
      footer={<AuthFooterLink prompt="Wrong address?" href="/register" label="Start again" />}
    >
      <Suspense fallback={<Skeleton className="h-32" />}>
        <VerifyEmailPanel email={user?.email ?? null} verified={user?.emailVerified ?? false} />
      </Suspense>
    </AuthCard>
  );
}
