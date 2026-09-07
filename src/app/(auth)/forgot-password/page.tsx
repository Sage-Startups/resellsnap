import type { Metadata } from 'next';
import { AuthCard, AuthFooterLink } from '@/components/auth/auth-card';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email address on your account and we will send you a link."
      footer={<AuthFooterLink prompt="Remembered it?" href="/login" label="Back to sign in" />}
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
