'use client';

import { ConfirmAction } from '@/components/admin/confirm-action';
import { replayWebhookAction } from '@/server/admin/actions';

export function WebhookReplay({
  webhookEventId,
  eventType,
  eventId,
}: {
  webhookEventId: string;
  eventType: string;
  eventId: string;
}) {
  return (
    <ConfirmAction
      label="Replay"
      title="Replay this webhook?"
      description="We re-fetch the event from Stripe and run the handler again. Credit grants are keyed on the billing period, so a replay cannot double-grant — but it can still change subscription state."
      targetName={`${eventType} · ${eventId}`}
      confirmLabel="Replay event"
      variant="danger"
      onConfirm={async (reason) => replayWebhookAction({ webhookEventId, reason })}
    />
  );
}
