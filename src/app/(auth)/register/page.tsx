import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Check } from 'lucide-react';
import { AuthCard, AuthFooterLink } from '@/components/auth/auth-card';
import { GoogleButton } from '@/components/auth/google-button';
import { isGoogleOAuthConfigured } from '@/lib/env';
import { getCurrentUser } from '@/server/session';
import { getSettings } from '@/server/settings';
import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: 'Create your account',
  robots: { index: false, follow: false },
};

export default async function RegisterPage() {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
  if (user) redirect('/app');

  return (
    <div className="space-y-4">
      <AuthCard
        title="Create your account"
        description={`${settings.signupFreeCredits} free listing credits. No card required.`}
        footer={<AuthFooterLink prompt="Already have an account?" href="/login" label="Sign in" />}
      >
        {isGoogleOAuthConfigured() ? <GoogleButton /> : null}
        <RegisterForm />
      </AuthCard>

      <ul className="space-y-2 px-1">
        {[
          'Nothing publishes anywhere without your explicit confirmation',
          'Your photos stay private and are never made public',
          'Cancel or delete your account at any time',
        ].map((point) => (
          <li key={point} className="flex gap-2 text-[12px] leading-relaxed text-muted">
            <Check className="mt-0.5 size-3.5 shrink-0 text-lime-deep" aria-hidden="true" />
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}
