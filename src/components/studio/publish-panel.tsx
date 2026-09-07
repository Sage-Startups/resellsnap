'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ExternalLink, Upload } from 'lucide-react';
import { Alert, Button, Card, CardContent } from '@/components/ui';
import { publishToMarketplaceAction } from '@/server/marketplace/actions';
import type { PlatformKey } from '@/lib/enums';

/**
 * Direct publishing, with an explicit final confirmation.
 *
 * Nothing is ever published as a side effect of generation. The seller reads
 * exactly what is about to go live, then presses the button — and we only claim
 * success once the marketplace returns a listing id.
 */
export function PublishPanel({
  itemId,
  platform,
  platformName,
  connectionId,
  blocked,
  setupIssues,
}: {
  itemId: string;
  platform: PlatformKey;
  platformName: string;
  connectionId?: string;
  blocked: boolean;
  setupIssues: string[];
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ url?: string; error?: string } | null>(null);

  if (setupIssues.length > 0) {
    return (
      <Alert tone="warning" title={`Finish setting up ${platformName} first`}>
        <ul className="mt-1 space-y-1">
          {setupIssues.map((issue) => (
            <li key={issue} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {issue}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12px]">
          These are requirements from {platformName}, not from us. Exports work in the meantime.
        </p>
      </Alert>
    );
  }

  if (result?.url) {
    return (
      <Alert tone="success" title={`Published to ${platformName}`}>
        <p>{platformName} confirmed the listing is live.</p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <a href={result.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            View the live listing
          </a>
        </Button>
      </Alert>
    );
  }

  if (confirming) {
    return (
      <Card className="border-ink">
        <CardContent className="p-4">
          <h4 className="text-[14px] font-semibold text-ink">
            Publish this to {platformName}?
          </h4>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            This creates a live listing on your {platformName} account using exactly the title,
            description, fields, photos and price shown on this page. You are responsible for its
            accuracy and for complying with {platformName}&rsquo;s policies.
          </p>

          {result?.error ? (
            <Alert tone="danger" className="mt-3">
              {result.error}
            </Alert>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={pending || !connectionId}
              onClick={async () => {
                if (!connectionId) return;
                setPending(true);
                setResult(null);

                const response = await publishToMarketplaceAction({
                  itemId,
                  platform,
                  connectionId,
                });

                if (response.ok && response.data?.externalUrl) {
                  setResult({ url: response.data.externalUrl });
                  router.refresh();
                } else {
                  setResult({
                    error:
                      response.error ??
                      `${platformName} did not confirm the listing, so we have not marked it as published.`,
                  });
                }
                setPending(false);
              }}
            >
              {pending ? 'Publishing…' : `Yes, publish to ${platformName}`}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <Button
        variant="primary"
        disabled={blocked || !connectionId}
        onClick={() => setConfirming(true)}
      >
        <Upload />
        Publish to {platformName}
      </Button>
      {blocked ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted">
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          Fix the issues above and set a price before publishing.
        </p>
      ) : (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted">
          <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
          You will be asked to confirm before anything goes live.
        </p>
      )}
    </div>
  );
}
