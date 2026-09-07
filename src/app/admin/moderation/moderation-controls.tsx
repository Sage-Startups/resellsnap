'use client';

import { ConfirmAction } from '@/components/admin/confirm-action';
import { removeItemContentAction, resolveModerationAction } from '@/server/admin/actions';

export function ModerationControls({
  flagId,
  itemId,
  itemLabel,
  itemDeleted,
}: {
  flagId: string;
  itemId: string | null;
  itemLabel: string;
  itemDeleted: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <ConfirmAction
        label="Dismiss"
        title="Dismiss this flag?"
        description="Records that this was reviewed and needed no action. The item is untouched."
        targetName={itemLabel || 'This flag'}
        confirmLabel="Dismiss flag"
        variant="outline"
        onConfirm={async (reason) =>
          resolveModerationAction({ flagId, status: 'DISMISSED', resolution: reason })
        }
      />

      {itemId && !itemDeleted ? (
        <ConfirmAction
          label="Remove item"
          title="Remove this item and close the flag?"
          description="The item is soft-deleted and archived, so the seller cannot publish or export it. Their photographs stay in storage until the retention job runs, which makes a mistake recoverable."
          targetName={itemLabel}
          confirmLabel="Remove and close"
          variant="danger"
          onConfirm={async (reason) => {
            const removal = await removeItemContentAction({ itemId, reason });
            if (!removal.ok) return removal;
            return resolveModerationAction({
              flagId,
              status: 'ACTIONED',
              resolution: `Item removed. ${reason}`,
            });
          }}
        />
      ) : (
        <ConfirmAction
          label="Mark actioned"
          title="Close this flag as actioned?"
          description="Use this when you have already dealt with the underlying issue."
          targetName={itemLabel || 'This flag'}
          confirmLabel="Mark actioned"
          variant="primary"
          onConfirm={async (reason) =>
            resolveModerationAction({ flagId, status: 'ACTIONED', resolution: reason })
          }
        />
      )}
    </div>
  );
}
