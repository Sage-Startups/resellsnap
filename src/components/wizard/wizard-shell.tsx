'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WizardStep {
  key: string;
  label: string;
  description: string;
}

export function WizardShell({
  steps,
  currentIndex,
  children,
  onStepClick,
}: {
  steps: WizardStep[];
  currentIndex: number;
  children: React.ReactNode;
  onStepClick?: (index: number) => void;
}) {
  const current = steps[currentIndex];

  return (
    <div className="space-y-6">
      {/* Mobile: compact. Desktop: full stepper. */}
      <nav aria-label="Progress">
        <ol className="hidden items-center gap-2 sm:flex">
          {steps.map((step, index) => {
            const done = index < currentIndex;
            const active = index === currentIndex;
            const clickable = Boolean(onStepClick) && index < currentIndex;

            return (
              <li key={step.key} className="flex flex-1 items-center gap-2">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onStepClick?.(index)}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-2 py-1.5 text-left',
                    clickable && 'hover:bg-stone-100',
                    !clickable && 'cursor-default',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                      done && 'bg-success text-white',
                      active && 'bg-ink text-bone',
                      !done && !active && 'border border-stone-300 text-subtle',
                    )}
                  >
                    {done ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
                  </span>
                  <span
                    className={cn(
                      'text-[13px] font-medium',
                      active ? 'text-ink' : done ? 'text-ink-soft' : 'text-subtle',
                    )}
                  >
                    {step.label}
                  </span>
                </button>
                {index < steps.length - 1 ? (
                  <span
                    className={cn('h-px flex-1', done ? 'bg-success/40' : 'bg-stone-200')}
                    aria-hidden="true"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="sm:hidden">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink">{current?.label}</p>
            <p className="text-[12px] text-muted">
              Step {currentIndex + 1} of {steps.length}
            </p>
          </div>
          <div className="mt-2 flex gap-1" aria-hidden="true">
            {steps.map((step, index) => (
              <span
                key={step.key}
                className={cn(
                  'h-1 flex-1 rounded-full',
                  index <= currentIndex ? 'bg-ink' : 'bg-stone-200',
                )}
              />
            ))}
          </div>
        </div>
      </nav>

      {current ? (
        <div className="hidden sm:block">
          <h2 className="text-lg font-semibold tracking-tight text-ink">{current.label}</h2>
          <p className="mt-0.5 text-[13px] text-muted">{current.description}</p>
        </div>
      ) : null}

      <div>{children}</div>
    </div>
  );
}
