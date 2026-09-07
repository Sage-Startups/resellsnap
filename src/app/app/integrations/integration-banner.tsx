'use client';

import { useSearchParams } from 'next/navigation';
import { Alert } from '@/components/ui';

const ERRORS: Record<string, string> = {
  declined:
    'You declined the authorisation, so nothing was connected. You can try again whenever you like.',
  invalid_callback:
    'That authorisation link was incomplete. Start the connection again from this page.',
  connection_failed:
    'We could not complete that connection. The link may have expired — please try again.',
  not_supported: 'That platform does not offer an approved connection flow on this deployment.',
  rate_limited: 'Too many connection attempts. Please wait a moment and try again.',
};

export function IntegrationBanner() {
  const params = useSearchParams();
  const connected = params.get('connected');
  const error = params.get('error');

  if (connected) {
    return (
      <Alert tone="success" title="Connected">
        Your {connected === 'ebay' ? 'eBay' : connected} account is linked. You can now publish
        directly after reviewing each listing.
      </Alert>
    );
  }

  if (error) {
    return <Alert tone="warning">{ERRORS[error] ?? 'That connection did not complete.'}</Alert>;
  }

  return null;
}
