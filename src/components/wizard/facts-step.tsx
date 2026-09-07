'use client';

import { useState } from 'react';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import {
  CATEGORY_HINTS,
  CONDITION_OPTIONS,
  FACT_KEYS,
  fieldsForCategory,
} from '@/server/items/facts';
import { parseMoneyToCents } from '@/lib/money';

export interface FactsFormValues {
  name: string;
  barcode: string;
  category: string;
  brand: string;
  model: string;
  size: string;
  colour: string;
  material: string;
  ageEra: string;
  functionalStatus: string;
  tested: string;
  defects: string;
  missingParts: string;
  includedItems: string;
  accessories: string;
  measurements: string;
  measurementUnit: string;
  condition: string;
  quantity: string;
  acquisitionCost: string;
  desiredMinPrice: string;
  shippingPreference: string;
  country: string;
  notes: string;
}

export const EMPTY_FACTS: FactsFormValues = {
  name: '', barcode: '', category: '', brand: '', model: '', size: '', colour: '',
  material: '', ageEra: '', functionalStatus: '', tested: '', defects: '',
  missingParts: '', includedItems: '', accessories: '', measurements: '',
  measurementUnit: 'in', condition: '', quantity: '1', acquisitionCost: '',
  desiredMinPrice: '', shippingPreference: 'SHIPPING', country: 'US', notes: '',
};

/**
 * Collects only what a photograph cannot answer, and adapts by category so a
 * jumper seller is never asked whether it powers on.
 */
export function FactsStep({
  values,
  onChange,
  currency,
}: {
  values: FactsFormValues;
  onChange: (next: FactsFormValues) => void;
  currency: string;
}) {
  const [showOptional, setShowOptional] = useState(false);
  const relevant = new Set(fieldsForCategory(values.category));

  const set = <K extends keyof FactsFormValues>(key: K, value: FactsFormValues[K]) =>
    onChange({ ...values, [key]: value });

  return (
    <div className="space-y-5">
      <Alert tone="neutral">
        Everything you enter here is treated as fact and overrides anything the AI thinks it sees.
        Leave a field blank rather than guessing — a blank field is simply left out of the listing.
      </Alert>

      <Field
        label="What is it?"
        htmlFor="fact-category"
        required
        hint="This decides which questions we ask next."
      >
        <Select
          id="fact-category"
          value={values.category}
          onChange={(event) => set('category', event.target.value)}
        >
          <option value="">Choose a category…</option>
          {CATEGORY_HINTS.map((hint) => (
            <option key={hint.value} value={hint.value}>
              {hint.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Overall condition"
        htmlFor="fact-condition"
        required
        hint="Be honest here — a disclosed flaw prevents a return, a hidden one causes a dispute."
      >
        <Select
          id="fact-condition"
          value={values.condition}
          onChange={(event) => set('condition', event.target.value)}
        >
          <option value="">Choose a condition…</option>
          {CONDITION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} — {option.hint}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Defects, marks or damage"
        htmlFor="fact-defects"
        hint="Anything a buyer would want to know. Leave blank only if there genuinely is nothing."
      >
        <Textarea
          id="fact-defects"
          rows={3}
          value={values.defects}
          onChange={(event) => set('defects', event.target.value)}
          placeholder="e.g. Light scuffing on the right toe; small mark near the left cuff"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Brand" htmlFor="fact-brand" hint="Only if you can read it on the item.">
          <Input
            id="fact-brand"
            value={values.brand}
            onChange={(event) => set('brand', event.target.value)}
          />
        </Field>

        {relevant.has(FACT_KEYS.SIZE) ? (
          <Field label="Size" htmlFor="fact-size">
            <Input
              id="fact-size"
              value={values.size}
              onChange={(event) => set('size', event.target.value)}
              placeholder="e.g. UK 8 / US 9, or M"
            />
          </Field>
        ) : null}

        {relevant.has(FACT_KEYS.MODEL) ? (
          <Field label="Model" htmlFor="fact-model" hint="From the label or plate, if there is one.">
            <Input
              id="fact-model"
              value={values.model}
              onChange={(event) => set('model', event.target.value)}
            />
          </Field>
        ) : null}

        {relevant.has(FACT_KEYS.MATERIAL) ? (
          <Field label="Material" htmlFor="fact-material" hint="From the care label where possible.">
            <Input
              id="fact-material"
              value={values.material}
              onChange={(event) => set('material', event.target.value)}
            />
          </Field>
        ) : null}

        {relevant.has(FACT_KEYS.COLOUR) ? (
          <Field label="Colour" htmlFor="fact-colour">
            <Input
              id="fact-colour"
              value={values.colour}
              onChange={(event) => set('colour', event.target.value)}
            />
          </Field>
        ) : null}

        {relevant.has(FACT_KEYS.AGE_ERA) ? (
          <Field label="Age or era" htmlFor="fact-age" hint="Only if you know.">
            <Input
              id="fact-age"
              value={values.ageEra}
              onChange={(event) => set('ageEra', event.target.value)}
              placeholder="e.g. 1990s"
            />
          </Field>
        ) : null}
      </div>

      {relevant.has(FACT_KEYS.FUNCTIONAL_STATUS) || relevant.has(FACT_KEYS.TESTED) ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Have you tested it?" htmlFor="fact-tested" required>
            <Select
              id="fact-tested"
              value={values.tested}
              onChange={(event) => set('tested', event.target.value)}
            >
              <option value="">Choose…</option>
              <option value="yes">Yes, it works</option>
              <option value="no">No, untested</option>
              <option value="not_applicable">Not applicable</option>
            </Select>
          </Field>
          <Field
            label="Working condition"
            htmlFor="fact-functional"
            hint="Say what does and does not work."
          >
            <Input
              id="fact-functional"
              value={values.functionalStatus}
              onChange={(event) => set('functionalStatus', event.target.value)}
              placeholder="e.g. Fully working; descaled before listing"
            />
          </Field>
        </div>
      ) : null}

      {relevant.has(FACT_KEYS.MEASUREMENTS) ? (
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field
            label="Measurements"
            htmlFor="fact-measurements"
            hint="We never estimate these from a photo — only you can measure it."
          >
            <Input
              id="fact-measurements"
              value={values.measurements}
              onChange={(event) => set('measurements', event.target.value)}
              placeholder="e.g. Chest 106, length 62, sleeve 61"
            />
          </Field>
          <Field label="Units" htmlFor="fact-unit">
            <Select
              id="fact-unit"
              value={values.measurementUnit}
              onChange={(event) => set('measurementUnit', event.target.value)}
              className="w-24"
            >
              <option value="in">in</option>
              <option value="cm">cm</option>
            </Select>
          </Field>
        </div>
      ) : null}

      {relevant.has(FACT_KEYS.ACCESSORIES) || relevant.has(FACT_KEYS.MISSING_PARTS) ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What is included" htmlFor="fact-accessories">
            <Input
              id="fact-accessories"
              value={values.accessories}
              onChange={(event) => set('accessories', event.target.value)}
              placeholder="e.g. Portafilter, two baskets, tamper"
            />
          </Field>
          <Field label="Anything missing?" htmlFor="fact-missing">
            <Input
              id="fact-missing"
              value={values.missingParts}
              onChange={(event) => set('missingParts', event.target.value)}
              placeholder="e.g. No original box"
            />
          </Field>
        </div>
      ) : null}

      <div className="rounded-lg border border-stone-200 bg-paper">
        <button
          type="button"
          onClick={() => setShowOptional((value) => !value)}
          aria-expanded={showOptional}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-[13px] font-medium text-ink">
            Pricing, shipping and notes
          </span>
          <span className="text-[12px] text-muted">{showOptional ? 'Hide' : 'Optional'}</span>
        </button>

        {showOptional ? (
          <div className="space-y-4 border-t border-stone-200 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="What did it cost you?"
                htmlFor="fact-cost"
                hint="Used to calculate your margin. Never shown to buyers."
              >
                <Input
                  id="fact-cost"
                  inputMode="decimal"
                  value={values.acquisitionCost}
                  onChange={(event) => set('acquisitionCost', event.target.value)}
                  placeholder={`${currency} 0.00`}
                />
              </Field>

              <Field
                label="Lowest price you would accept"
                htmlFor="fact-min"
                hint="We will not suggest anything below this."
              >
                <Input
                  id="fact-min"
                  inputMode="decimal"
                  value={values.desiredMinPrice}
                  onChange={(event) => set('desiredMinPrice', event.target.value)}
                  placeholder={`${currency} 0.00`}
                />
              </Field>

              <Field label="Quantity" htmlFor="fact-quantity">
                <Input
                  id="fact-quantity"
                  type="number"
                  min={1}
                  max={999}
                  value={values.quantity}
                  onChange={(event) => set('quantity', event.target.value)}
                />
              </Field>

              <Field label="Shipping or pickup" htmlFor="fact-shipping">
                <Select
                  id="fact-shipping"
                  value={values.shippingPreference}
                  onChange={(event) => set('shippingPreference', event.target.value)}
                >
                  <option value="SHIPPING">Shipping only</option>
                  <option value="LOCAL_PICKUP">Local pickup only</option>
                  <option value="BOTH">Both</option>
                </Select>
              </Field>
            </div>

            <Field label="Item name" htmlFor="fact-name" hint="Optional — we will write one for you.">
              <Input
                id="fact-name"
                value={values.name}
                onChange={(event) => set('name', event.target.value)}
              />
            </Field>

            <Field label="Anything else?" htmlFor="fact-notes">
              <Textarea
                id="fact-notes"
                rows={3}
                value={values.notes}
                onChange={(event) => set('notes', event.target.value)}
                placeholder="Context that would help write the listing"
              />
            </Field>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Converts the form's strings into the shape `SellerFactsSchema` expects. */
export function factsToPayload(values: FactsFormValues) {
  const trim = (value: string) => (value.trim() === '' ? undefined : value.trim());

  return {
    name: trim(values.name),
    barcode: trim(values.barcode),
    category: trim(values.category),
    brand: trim(values.brand),
    model: trim(values.model),
    size: trim(values.size),
    colour: trim(values.colour),
    material: trim(values.material),
    ageEra: trim(values.ageEra),
    functionalStatus: trim(values.functionalStatus),
    tested: values.tested === '' ? undefined : values.tested,
    defects: trim(values.defects),
    missingParts: trim(values.missingParts),
    includedItems: trim(values.includedItems),
    accessories: trim(values.accessories),
    measurements: trim(values.measurements),
    measurementUnit: values.measurementUnit === '' ? undefined : values.measurementUnit,
    condition: values.condition === '' ? undefined : values.condition,
    quantity: Number(values.quantity) || 1,
    acquisitionCostCents: parseMoneyToCents(values.acquisitionCost),
    desiredMinPriceCents: parseMoneyToCents(values.desiredMinPrice),
    shippingPreference: values.shippingPreference,
    country: values.country || 'US',
    notes: trim(values.notes),
  };
}

export function isFactsStepValid(values: FactsFormValues): boolean {
  return values.category !== '' && values.condition !== '';
}
