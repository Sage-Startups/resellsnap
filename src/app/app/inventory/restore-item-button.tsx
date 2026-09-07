'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui';
import { restoreItemAction } from '@/server/items/actions';

export function RestoreItemButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await restoreItemAction(itemId);
          router.refresh();
        })
      }
    >
      <RotateCcw />
      {pending ? 'Restoring…' : 'Restore'}
    </Button>
  );
}
