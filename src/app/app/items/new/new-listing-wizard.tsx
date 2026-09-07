'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Coins } from 'lucide-react';
import { Alert, Button, Card, CardContent } from '@/components/ui';
import { WizardShell, type WizardStep } from '@/components/wizard/wizard-shell';
import { PhotoStep, type WizardPhoto } from '@/components/wizard/photo-step';
import {
  EMPTY_FACTS,
  FactsStep,
  factsToPayload,
  isFactsStepValid,
  type FactsFormValues,
} from '@/components/wizard/facts-step';
import { GenerationStep } from '@/components/wizard/generation-step';
import { saveSellerFactsAction, startGenerationAction } from '@/server/items/actions';

const STEPS: WizardStep[] = [
  { key: 'photos', label: 'Photos', description: 'Add the photographs a buyer would want to see.' },
  { key: 'facts', label: 'Your details', description: 'Tell us the things a photograph cannot show.' },
  { key: 'generate', label: 'Generate', description: 'We analyse the photos and write your drafts.' },
];

/** Draft autosave key, scoped per item so two tabs cannot cross-contaminate. */
const draftKey = (itemId: string) => `resellsnap:draft:${itemId}`;

export function NewListingWizard({
  itemId,
  maxPhotos,
  maxBytes,
  currency,
  creditsAvailable,
  initialPhotos,
}: {
  itemId: string;
  maxPhotos: number;
  maxBytes: number;
  currency: string;
  creditsAvailable: number;
  initialPhotos: WizardPhoto[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [processedCount, setProcessedCount] = useState(
    initialPhotos.filter((photo) => photo.status === 'PROCESSED').length,
  );
  const [facts, setFacts] = useState<FactsFormValues>(EMPTY_FACTS);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [started, setStarted] = useState(false);

  // Restore an in-progress draft so a refresh or a lost connection is not
  // punished by losing the seller's typing.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(draftKey(itemId));
      if (stored) setFacts({ ...EMPTY_FACTS, ...(JSON.parse(stored) as FactsFormValues) });
    } catch {
      // A corrupt draft is not worth surfacing; start clean.
    }
  }, [itemId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey(itemId), JSON.stringify(facts));
      } catch {
        // Storage may be unavailable in private mode; autosave is a nicety.
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [facts, itemId]);

  const handleReady = useCallback((count: number) => setProcessedCount(count), []);

  async function goToFacts() {
    if (processedCount === 0) {
      setError('Add at least one photo before continuing.');
      return;
    }
    setError(null);
    setStep(1);
  }

  async function generate() {
    if (!isFactsStepValid(facts)) {
      setError('Choose a category and a condition before generating.');
      return;
    }
    if (creditsAvailable < 1) {
      setError('You have no listing credits left. Top up on the billing page to continue.');
      return;
    }

    setPending(true);
    setError(null);

    const saved = await saveSellerFactsAction(itemId, factsToPayload(facts));
    if (!saved.ok) {
      setError(saved.error ?? 'We could not save your details.');
      setPending(false);
      return;
    }

    const result = await startGenerationAction({ itemId });
    if (!result.ok) {
      setError(result.error ?? 'We could not start the generation.');
      setPending(false);
      return;
    }

    try {
      window.localStorage.removeItem(draftKey(itemId));
    } catch {
      // Ignore — the draft will simply be overwritten next time.
    }

    setStarted(true);
    setStep(2);
    setPending(false);
    router.refresh();
  }

  return (
    <WizardShell steps={STEPS} currentIndex={step} onStepClick={started ? undefined : setStep}>
      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <Card>
        <CardContent className="p-5 sm:p-6">
          {step === 0 ? (
            <PhotoStep
              itemId={itemId}
              maxPhotos={maxPhotos}
              maxBytes={maxBytes}
              initialPhotos={initialPhotos}
              onReady={handleReady}
            />
          ) : null}

          {step === 1 ? (
            <FactsStep values={facts} onChange={setFacts} currency={currency} />
          ) : null}

          {step === 2 ? <GenerationStep itemId={itemId} /> : null}
        </CardContent>
      </Card>

      {step < 2 ? (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {step === 0 ? (
              <Button asChild variant="ghost">
                <Link href="/app">
                  <ArrowLeft />
                  Cancel
                </Link>
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setStep(0)}>
                <ArrowLeft />
                Back to photos
              </Button>
            )}
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            {step === 1 ? (
              <span className="flex items-center gap-1.5 text-[12px] text-muted">
                <Coins className="size-3.5" aria-hidden="true" />
                Uses 1 of your {creditsAvailable} credits
              </span>
            ) : null}

            {step === 0 ? (
              <Button variant="primary" onClick={goToFacts} disabled={processedCount === 0}>
                Continue
                <ArrowRight />
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={generate}
                disabled={pending || !isFactsStepValid(facts)}
              >
                {pending ? 'Starting…' : 'Generate my listings'}
                {!pending ? <ArrowRight /> : null}
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </WizardShell>
  );
}
