'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { Alert, Button, Skeleton } from '@/components/ui';
import { getGenerationStatusAction } from '@/server/items/actions';

const STAGES = [
  { at: 10, label: 'Reading your photographs' },
  { at: 45, label: 'Working out what is visible' },
  { at: 60, label: 'Writing the master listing' },
  { at: 75, label: 'Adapting for each marketplace' },
  { at: 95, label: 'Suggesting prices' },
];

/**
 * Progress reflects work actually completed on the server — an analysis row
 * written, a variant generated — not a timer pretending to be progress.
 */
export function GenerationStep({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState(8);
  const [status, setStatus] = useState<string>('QUEUED');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      const result = await getGenerationStatusAction(itemId);
      if (!active) return;

      if (!result.ok || !result.data) {
        setError(result.error ?? 'We lost track of that generation.');
        return;
      }

      setProgress(result.data.progress);
      setStatus(result.data.status);

      if (result.data.itemStatus === 'READY') {
        router.push(`/app/items/${itemId}?generated=1`);
        router.refresh();
        return;
      }

      if (result.data.status === 'FAILED') {
        setError(
          result.data.error ??
            'The generation did not complete. Your credit has been returned to your balance.',
        );
      }
    };

    void poll();
    const timer = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [itemId, router]);

  if (error) {
    return (
      <Alert tone="danger" title="Generation did not finish">
        <p>{error}</p>
        <p className="mt-2">
          Your listing credit has been returned. You can retry from the item page.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => router.push(`/app/items/${itemId}`)}
        >
          Open the item
        </Button>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 py-6">
      <div className="text-center">
        <span className="inline-grid size-12 place-items-center rounded-full bg-lime-wash">
          <Sparkles className="size-5 text-ink" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-[17px] font-semibold text-ink">Analysing your item</h2>
        <p className="mt-1 text-[13px] text-muted">
          This usually takes 20 to 60 seconds. You can leave this page — we will email you when it
          is ready.
        </p>
      </div>

      <div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-stone-200"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Generation progress"
        >
          <div
            className="h-full rounded-full bg-lime-deep transition-[width] duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <ul className="mt-5 space-y-2.5">
          {STAGES.map((stage) => {
            const done = progress >= stage.at;
            return (
              <li key={stage.label} className="flex items-center gap-2.5">
                {done ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <span
                    className="size-4 shrink-0 rounded-full border-2 border-stone-300"
                    aria-hidden="true"
                  />
                )}
                <span className={done ? 'text-[13px] text-ink' : 'text-[13px] text-muted'}>
                  {stage.label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {status === 'QUEUED' ? (
        <p className="text-center text-[12px] text-muted">
          Waiting for a worker to pick this up…
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}
