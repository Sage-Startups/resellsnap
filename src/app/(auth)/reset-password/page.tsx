import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthCard, AuthFooterLink } from '@/components/auth/auth-card';
import { Skeleton } from '@/components/ui';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Choose a new password"
      description="Pick something you have not used elsewhere."
      footer={<AuthFooterLink prompt="Changed your mind?" href="/login" label="Back to sign in" />}
    >
      <Suspense fallback={<Skeleton className="h-48" />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
