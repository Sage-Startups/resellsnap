import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard, AuthFooterLink } from '@/components/auth/auth-card';
import { GoogleButton } from '@/components/auth/google-button';
import { Skeleton } from '@/components/ui';
import { isGoogleOAuthConfigured } from '@/lib/env';
import { getCurrentUser } from '@/server/session';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect('/app');

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Your drafts and inventory are where you left them."
      footer={<AuthFooterLink prompt="New here?" href="/register" label="Create an account" />}
    >
      {isGoogleOAuthConfigured() ? <GoogleButton /> : null}
      <Suspense fallback={<Skeleton className="h-64" />}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
