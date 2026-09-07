'use client';

import { useEffect, useRef, useState } from 'react';
import { Field, Input, Textarea } from '@/components/ui';
import { CopyButton } from './copy-button';
import { updateMasterListingAction } from '@/server/items/actions';

export interface MasterData {
  title: string;
  description: string;
  conditionSummary: string;
  defectDisclosure: string;
  includedItems: string;
  measurements: string;
  attributes: Record<string, string>;
  searchTerms: string[];
}

export function MasterEditor({ itemId, master }: { itemId: string; master: MasterData }) {
  const [values, setValues] = useState(master);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) return;
    setSaveState('saving');

    const timer = setTimeout(async () => {
      const result = await updateMasterListingAction(itemId, {
        title: values.title,
        description: values.description,
        conditionSummary: values.conditionSummary,
        defectDisclosure: values.defectDisclosure,
        includedItems: values.includedItems,
        measurements: values.measurements,
      });
      setSaveState(result.ok ? 'saved' : 'error');
      dirtyRef.current = false;
      if (result.ok) setTimeout(() => setSaveState('idle'), 2000);
    }, 900);

    return () => clearTimeout(timer);
  }, [values, itemId]);

  const set = <K extends keyof MasterData>(key: K, value: MasterData[K]) => {
    dirtyRef.current = true;
    setValues((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <span className="text-[11px] text-muted" aria-live="polite">
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'saved'
              ? 'Saved'
              : saveState === 'error'
                ? 'Could not save'
                : ''}
        </span>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="master-title" className="text-[13px] font-medium text-ink">
            Title
          </label>
          <CopyButton value={values.title} label="Copy title" />
        </div>
        <Input
          id="master-title"
          value={values.title}
          onChange={(event) => set('title', event.target.value)}
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="master-description" className="text-[13px] font-medium text-ink">
            Description
          </label>
          <CopyButton value={values.description} label="Copy description" />
        </div>
        <Textarea
          id="master-description"
          rows={9}
          value={values.description}
          onChange={(event) => set('description', event.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Condition summary" htmlFor="master-condition">
          <Textarea
            id="master-condition"
            rows={3}
            value={values.conditionSummary}
            onChange={(event) => set('conditionSummary', event.target.value)}
          />
        </Field>

        <Field
          label="Defects to disclose"
          htmlFor="master-defects"
          hint="A disclosed flaw prevents a return; a hidden one causes a dispute."
        >
          <Textarea
            id="master-defects"
            rows={3}
            value={values.defectDisclosure}
            onChange={(event) => set('defectDisclosure', event.target.value)}
          />
        </Field>

        <Field label="What is included" htmlFor="master-included">
          <Input
            id="master-included"
            value={values.includedItems}
            onChange={(event) => set('includedItems', event.target.value)}
          />
        </Field>

        <Field label="Measurements" htmlFor="master-measurements">
          <Input
            id="master-measurements"
            value={values.measurements}
            onChange={(event) => set('measurements', event.target.value)}
          />
        </Field>
      </div>

      {Object.keys(values.attributes).length > 0 ? (
        <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-4">
          <h4 className="text-[13px] font-semibold text-ink">Attributes</h4>
          <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {Object.entries(values.attributes).map(([key, value]) => (
              <div key={key} className="flex items-baseline justify-between gap-3">
                <dt className="text-[12px] text-muted">{key}</dt>
                <dd className="text-[12px] font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {values.searchTerms.length > 0 ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <h4 className="text-[13px] font-medium text-ink">Search terms</h4>
            <CopyButton value={values.searchTerms.join(', ')} label="Copy search terms" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {values.searchTerms.map((term) => (
              <span
                key={term}
                className="rounded-full border border-stone-200 bg-paper px-2.5 py-0.5 text-[12px] text-ink-soft"
              >
                {term}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
