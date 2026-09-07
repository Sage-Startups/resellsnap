/**
 * Seller facts.
 *
 * The wizard asks only for what AI cannot safely know from a photograph. Each
 * answer is stored as an `ItemFact` tagged `SELLER_CONFIRMED`, which outranks
 * anything the model infers. Inferences land as `AI_INFERENCE` and are only
 * promoted to `SELLER_CONFIRMED` when the seller explicitly accepts or edits
 * them — a guess is never silently turned into a fact.
 */
import { z } from 'zod';
import { FactSource } from '@/generated/prisma/enums';

export const FACT_KEYS = {
  NAME: 'name',
  BARCODE: 'barcode',
  CATEGORY: 'category',
  BRAND: 'brand',
  MODEL: 'model',
  SIZE: 'size',
  COLOUR: 'colour',
  MATERIAL: 'material',
  AGE_ERA: 'ageEra',
  FUNCTIONAL_STATUS: 'functionalStatus',
  DEFECTS: 'defects',
  MISSING_PARTS: 'missingParts',
  INCLUDED_ITEMS: 'includedItems',
  MEASUREMENTS: 'measurements',
  MEASUREMENT_UNIT: 'measurementUnit',
  CONDITION: 'condition',
  TESTED: 'tested',
  ACCESSORIES: 'accessories',
} as const;

export type FactKey = (typeof FACT_KEYS)[keyof typeof FACT_KEYS];

/** Human labels used by the wizard, the review screen and the admin console. */
export const FACT_LABELS: Record<string, string> = {
  name: 'Item name',
  barcode: 'Barcode / UPC',
  category: 'Category',
  brand: 'Brand',
  model: 'Model',
  size: 'Size',
  colour: 'Colour',
  material: 'Material',
  ageEra: 'Age or era',
  functionalStatus: 'Working condition',
  defects: 'Defects, marks or damage',
  missingParts: 'Missing parts',
  includedItems: 'What is included',
  measurements: 'Measurements',
  measurementUnit: 'Measurement unit',
  condition: 'Overall condition',
  tested: 'Tested',
  accessories: 'Included accessories',
  pattern: 'Pattern',
  style: 'Style',
};

export const CONDITION_OPTIONS = [
  { value: 'new_with_tags', label: 'New with tags', hint: 'Unused, original tags attached' },
  { value: 'new_without_tags', label: 'New without tags', hint: 'Unused, tags removed' },
  { value: 'excellent', label: 'Excellent', hint: 'Barely used, no visible flaws' },
  { value: 'very_good', label: 'Very good', hint: 'Light wear, no significant flaws' },
  { value: 'good', label: 'Good', hint: 'Used with visible wear' },
  { value: 'acceptable', label: 'Acceptable', hint: 'Noticeable wear or flaws, still usable' },
  { value: 'for_parts', label: 'For parts or not working', hint: 'Faulty or incomplete' },
] as const;

export const CATEGORY_HINTS = [
  { value: 'clothing', label: 'Clothing' },
  { value: 'shoes', label: 'Shoes' },
  { value: 'bags_accessories', label: 'Bags & accessories' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'home_kitchen', label: 'Home & kitchen' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'toys_games', label: 'Toys & games' },
  { value: 'books_media', label: 'Books & media' },
  { value: 'sports_outdoors', label: 'Sports & outdoors' },
  { value: 'collectables', label: 'Collectables' },
  { value: 'beauty', label: 'Beauty' },
  { value: 'other', label: 'Something else' },
] as const;

export type CategoryHint = (typeof CATEGORY_HINTS)[number]['value'];

/**
 * Which extra questions a category deserves. Asking an electronics seller for a
 * chest measurement — or a jumper seller whether it powers on — wastes their
 * time and produces worse listings.
 */
export const CATEGORY_FIELDS: Record<string, FactKey[]> = {
  clothing: [FACT_KEYS.SIZE, FACT_KEYS.MATERIAL, FACT_KEYS.MEASUREMENTS, FACT_KEYS.COLOUR],
  shoes: [FACT_KEYS.SIZE, FACT_KEYS.MATERIAL, FACT_KEYS.COLOUR],
  bags_accessories: [FACT_KEYS.MATERIAL, FACT_KEYS.MEASUREMENTS, FACT_KEYS.COLOUR],
  electronics: [FACT_KEYS.MODEL, FACT_KEYS.FUNCTIONAL_STATUS, FACT_KEYS.TESTED, FACT_KEYS.ACCESSORIES],
  home_kitchen: [FACT_KEYS.FUNCTIONAL_STATUS, FACT_KEYS.TESTED, FACT_KEYS.MEASUREMENTS],
  furniture: [FACT_KEYS.MEASUREMENTS, FACT_KEYS.MATERIAL, FACT_KEYS.COLOUR],
  toys_games: [FACT_KEYS.MISSING_PARTS, FACT_KEYS.AGE_ERA],
  books_media: [FACT_KEYS.AGE_ERA],
  sports_outdoors: [FACT_KEYS.SIZE, FACT_KEYS.FUNCTIONAL_STATUS],
  collectables: [FACT_KEYS.AGE_ERA, FACT_KEYS.MEASUREMENTS],
  beauty: [FACT_KEYS.FUNCTIONAL_STATUS],
  other: [FACT_KEYS.MEASUREMENTS],
};

export function fieldsForCategory(category: string | null | undefined): FactKey[] {
  const base: FactKey[] = [FACT_KEYS.BRAND, FACT_KEYS.CONDITION, FACT_KEYS.DEFECTS];
  const extra = CATEGORY_FIELDS[category ?? 'other'] ?? CATEGORY_FIELDS.other ?? [];
  return [...new Set([...base, ...extra])];
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

/** Everything the wizard's "seller facts" step may submit. */
export const SellerFactsSchema = z.object({
  name: optionalText(140),
  barcode: optionalText(40),
  category: z.string().trim().max(40).optional(),
  brand: optionalText(80),
  model: optionalText(80),
  size: optionalText(60),
  colour: optionalText(60),
  material: optionalText(120),
  ageEra: optionalText(60),
  functionalStatus: optionalText(200),
  tested: z.enum(['yes', 'no', 'not_applicable']).optional(),
  defects: optionalText(1000),
  missingParts: optionalText(400),
  includedItems: optionalText(400),
  accessories: optionalText(400),
  measurements: optionalText(400),
  measurementUnit: z.enum(['in', 'cm']).optional(),
  condition: z.enum(CONDITION_OPTIONS.map((option) => option.value) as [string, ...string[]]).optional(),
  quantity: z.coerce.number().int().min(1).max(999).default(1),
  acquisitionCostCents: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
  desiredMinPriceCents: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
  shippingPreference: z.enum(['SHIPPING', 'LOCAL_PICKUP', 'BOTH']).default('SHIPPING'),
  country: z.string().trim().length(2).default('US'),
  notes: optionalText(2000),
});

export type SellerFacts = z.infer<typeof SellerFactsSchema>;

export interface FactRecord {
  key: string;
  value: string;
  source: FactSource;
  confidence?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  evidence?: string | null;
  confirmed: boolean;
}

/** Converts the validated wizard payload into fact rows. */
export function factsFromSellerInput(input: SellerFacts): FactRecord[] {
  const facts: FactRecord[] = [];

  const push = (key: string, value: string | undefined | null) => {
    if (value === undefined || value === null) return;
    const trimmed = String(value).trim();
    if (!trimmed) return;
    facts.push({ key, value: trimmed, source: FactSource.SELLER_CONFIRMED, confirmed: true });
  };

  push(FACT_KEYS.NAME, input.name);
  push(FACT_KEYS.BARCODE, input.barcode);
  push(FACT_KEYS.CATEGORY, input.category);
  push(FACT_KEYS.BRAND, input.brand);
  push(FACT_KEYS.MODEL, input.model);
  push(FACT_KEYS.SIZE, input.size);
  push(FACT_KEYS.COLOUR, input.colour);
  push(FACT_KEYS.MATERIAL, input.material);
  push(FACT_KEYS.AGE_ERA, input.ageEra);
  push(FACT_KEYS.FUNCTIONAL_STATUS, input.functionalStatus);
  push(FACT_KEYS.TESTED, input.tested);
  push(FACT_KEYS.DEFECTS, input.defects);
  push(FACT_KEYS.MISSING_PARTS, input.missingParts);
  push(FACT_KEYS.INCLUDED_ITEMS, input.includedItems);
  push(FACT_KEYS.ACCESSORIES, input.accessories);
  push(FACT_KEYS.MEASUREMENTS, input.measurements);
  push(FACT_KEYS.MEASUREMENT_UNIT, input.measurementUnit);
  push(FACT_KEYS.CONDITION, input.condition);

  return facts;
}

/** Renders facts as a labelled block for the prompt. Data, never instructions. */
export function formatFactsForPrompt(facts: FactRecord[]): string {
  const confirmed = facts.filter((fact) => fact.source === FactSource.SELLER_CONFIRMED);
  if (confirmed.length === 0) return '(the seller has not supplied any facts yet)';

  return confirmed
    .map((fact) => `- ${FACT_LABELS[fact.key] ?? fact.key}: ${fact.value}`)
    .join('\n');
}

export function conditionLabel(value: string | undefined | null): string {
  return CONDITION_OPTIONS.find((option) => option.value === value)?.label ?? 'Used';
}
