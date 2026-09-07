'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { startGenerationAction } from '@/server/items/actions';

export function RetryGenerationButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await startGenerationAction({ itemId });
          if (!result.ok) setError(result.error ?? 'Could not retry.');
          else router.refresh();
          setPending(false);
        }}
        className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-medium text-ink underline-offset-4 hover:underline disabled:opacity-50"
      >
        <RefreshCw className={pending ? 'size-3 animate-spin' : 'size-3'} aria-hidden="true" />
        {pending ? 'Retrying…' : 'Retry (uses 1 credit)'}
      </button>
      {error ? <p className="mt-1 text-[12px] text-danger">{error}</p> : null}
    </>
  );
}
