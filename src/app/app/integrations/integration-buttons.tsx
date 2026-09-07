'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Unlink } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui';
import { disconnectPlatformAction, startConnectionAction } from '@/server/marketplace/actions';
import type { PlatformKey } from '@/lib/enums';

export function ConnectButton({
  platform,
  platformName,
  disabled,
}: {
  platform: PlatformKey;
  platformName: string;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        variant="primary"
        size="sm"
        disabled={pending || disabled}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await startConnectionAction(platform);
          if (result.ok && result.data) {
            // Leave our origin entirely — the seller authorises on the
            // marketplace's own domain, never inside our UI.
            window.location.href = result.data.url;
          } else {
            setError(result.error ?? 'Could not start that connection.');
            setPending(false);
          }
        }}
      >
        <Link2 />
        {pending ? 'Opening…' : `Connect ${platformName}`}
      </Button>
      {error ? <p className="mt-1.5 text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}

export function DisconnectButton({
  platform,
  platformName,
}: {
  platform: PlatformKey;
  platformName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        <Unlink />
        Disconnect
      </Button>
    );
  }

  return (
    <Card className="border-danger">
      <CardContent className="p-3">
        <p className="text-[13px] font-medium text-ink">Disconnect {platformName}?</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          We will delete the stored access tokens. Listings already live on {platformName} stay
          live — this only stops ResellSnap AI from managing them. You can reconnect at any time.
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            variant="danger"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await disconnectPlatformAction(platform);
                setConfirming(false);
                router.refresh();
              })
            }
          >
            {pending ? 'Disconnecting…' : 'Yes, disconnect'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
