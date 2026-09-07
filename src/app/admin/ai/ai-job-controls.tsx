'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { cancelAIJobAction, retryAIJobAction } from '@/server/admin/actions';
import type { AIJobStatus } from '@/lib/enums';

export function AIJobControls({
  aiJobId,
  status,
}: {
  aiJobId: string;
  status: AIJobStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canRetry = status === 'FAILED' || status === 'CANCELLED';
  const canCancel = status === 'QUEUED' || status === 'RUNNING';

  if (!canRetry && !canCancel) {
    return <span className="text-[12px] text-subtle">—</span>;
  }

  return (
    <span className="flex justify-end gap-1">
      {canRetry ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await retryAIJobAction(aiJobId);
              if (!result.ok) setError(result.error ?? 'Retry failed');
              else router.refresh();
            })
          }
        >
          <RefreshCw />
          Retry
        </Button>
      ) : null}

      {canCancel ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await cancelAIJobAction(aiJobId);
              if (!result.ok) setError(result.error ?? 'Cancel failed');
              else router.refresh();
            })
          }
        >
          <X />
          Cancel
        </Button>
      ) : null}

      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </span>
  );
}
