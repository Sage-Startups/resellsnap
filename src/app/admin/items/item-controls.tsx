'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { ConfirmAction } from '@/components/admin/confirm-action';
import { adminRestoreItemAction, removeItemContentAction } from '@/server/admin/actions';

export function ItemModerationControls({
  itemId,
  label,
  isDeleted,
}: {
  itemId: string;
  label: string;
  isDeleted: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (isDeleted) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await adminRestoreItemAction(itemId);
            router.refresh();
          })
        }
      >
        {pending ? 'Restoring…' : 'Restore'}
      </Button>
    );
  }

  return (
    <ConfirmAction
      label="Remove"
      title="Remove this item's content?"
      description="The item is soft-deleted and archived. The customer can no longer publish or export it. Their photographs remain in storage until the retention job purges them, so a mistake is recoverable."
      targetName={label}
      confirmLabel="Remove content"
      variant="danger"
      onConfirm={async (reason) => removeItemContentAction({ itemId, reason })}
    />
  );
}
