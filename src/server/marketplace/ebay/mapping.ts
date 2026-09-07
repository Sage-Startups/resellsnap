/**
 * Maps a ResellSnap listing onto the eBay Sell API request shapes.
 *
 * Nothing in here invents data. Every value comes from the seller's confirmed
 * facts, the reviewed listing variant, or an explicit setting on the connection.
 */
import type { PlatformTemplate } from '@/lib/models';

/** eBay `ConditionEnum` values we use, ordered from best to worst. */
export const EBAY_CONDITIONS = [
  'NEW',
  'LIKE_NEW',
  'NEW_OTHER',
  'NEW_WITH_DEFECTS',
  'MANUFACTURER_REFURBISHED',
  'CERTIFIED_REFURBISHED',
  'SELLER_REFURBISHED',
  'USED_EXCELLENT',
  'USED_VERY_GOOD',
  'USED_GOOD',
  'USED_ACCEPTABLE',
  'FOR_PARTS_OR_NOT_WORKING',
] as const;

export type EbayCondition = (typeof EBAY_CONDITIONS)[number];

export function isEbayCondition(value: string): value is EbayCondition {
  return (EBAY_CONDITIONS as readonly string[]).includes(value);
}

/**
 * Maps our plain-English condition wording onto eBay's enum.
 *
 * Deliberately conservative: an unrecognised value becomes `USED_GOOD` rather
 * than anything better, and nothing ever maps to `NEW` unless the seller
 * explicitly said so.
 */
export function toEbayCondition(input: string | undefined | null): EbayCondition {
  const value = (input ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (isEbayCondition(value)) return value;

  const lower = (input ?? '').toLowerCase();
  if (/\bnew with tags?\b|\bbrand new\b|\bunused\b|\bsealed\b/.test(lower)) return 'NEW';
  if (/\blike new\b|\bnew without tags?\b/.test(lower)) return 'LIKE_NEW';
  if (/\bexcellent\b/.test(lower)) return 'USED_EXCELLENT';
  if (/\bvery good\b/.test(lower)) return 'USED_VERY_GOOD';
  if (/\bacceptable\b|\bfair\b|\bwell[- ]worn\b/.test(lower)) return 'USED_ACCEPTABLE';
  if (/\bfor parts\b|\bnot working\b|\bspares\b|\bfaulty\b|\bbroken\b/.test(lower)) {
    return 'FOR_PARTS_OR_NOT_WORKING';
  }
  if (/\brefurb/.test(lower)) return 'SELLER_REFURBISHED';
  return 'USED_GOOD';
}

export interface EbayInventoryItemPayload {
  availability: { shipToLocationAvailability: { quantity: number } };
  condition: EbayCondition;
  conditionDescription?: string;
  product: {
    title: string;
    description: string;
    aspects?: Record<string, string[]>;
    imageUrls: string[];
    brand?: string;
    mpn?: string;
  };
}

export interface EbayOfferPayload {
  sku: string;
  marketplaceId: string;
  format: 'FIXED_PRICE';
  availableQuantity: number;
  categoryId: string;
  listingDescription: string;
  listingPolicies: {
    fulfillmentPolicyId: string;
    paymentPolicyId: string;
    returnPolicyId: string;
  };
  pricingSummary: { price: { currency: string; value: string } };
  merchantLocationKey: string;
}

/** eBay expects the price as a decimal string; cents avoid float drift. */
export function centsToEbayValue(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
}

/**
 * eBay item specifics ("aspects") are name → array-of-values. We accept the
 * variant's `itemSpecifics` in either `"Name: Value"` string form or as an
 * object, and drop anything malformed rather than sending eBay a broken aspect.
 */
export function toEbayAspects(input: unknown): Record<string, string[]> {
  const aspects: Record<string, string[]> = {};

  const add = (name: string, value: string) => {
    const cleanName = name.trim().slice(0, 40);
    const cleanValue = value.trim().slice(0, 65);
    if (!cleanName || !cleanValue) return;
    (aspects[cleanName] ??= []).push(cleanValue);
  };

  if (Array.isArray(input)) {
    for (const entry of input) {
      if (typeof entry !== 'string') continue;
      const separator = entry.indexOf(':');
      if (separator <= 0) continue;
      add(entry.slice(0, separator), entry.slice(separator + 1));
    }
  } else if (input && typeof input === 'object') {
    for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
      if (typeof value === 'string') add(name, value);
      else if (Array.isArray(value)) {
        for (const entry of value) if (typeof entry === 'string') add(name, entry);
      }
    }
  }

  // eBay caps aspects; trimming here beats a rejected publish.
  return Object.fromEntries(Object.entries(aspects).slice(0, 30));
}

export interface BuildInventoryItemInput {
  title: string;
  description: string;
  conditionValue: string | null | undefined;
  conditionDescription: string;
  quantity: number;
  imageUrls: string[];
  itemSpecifics: unknown;
  brand?: string | null;
  template: Pick<PlatformTemplate, 'titleMaxLength' | 'descriptionMaxLength' | 'maxPhotos'>;
}

export function buildInventoryItem(input: BuildInventoryItemInput): EbayInventoryItemPayload {
  const aspects = toEbayAspects(input.itemSpecifics);

  return {
    availability: { shipToLocationAvailability: { quantity: Math.max(1, input.quantity) } },
    condition: toEbayCondition(input.conditionValue),
    conditionDescription: input.conditionDescription.slice(0, 1000) || undefined,
    product: {
      title: input.title.slice(0, input.template.titleMaxLength),
      description: input.description.slice(0, Math.min(input.template.descriptionMaxLength, 500_000)),
      aspects: Object.keys(aspects).length > 0 ? aspects : undefined,
      imageUrls: input.imageUrls.slice(0, input.template.maxPhotos),
      brand: input.brand?.trim() || undefined,
    },
  };
}

export interface BuildOfferInput {
  sku: string;
  marketplaceId: string;
  quantity: number;
  categoryId: string;
  description: string;
  priceCents: number;
  currency: string;
  fulfillmentPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
  merchantLocationKey: string;
}

export function buildOffer(input: BuildOfferInput): EbayOfferPayload {
  return {
    sku: input.sku,
    marketplaceId: input.marketplaceId,
    format: 'FIXED_PRICE',
    availableQuantity: Math.max(1, input.quantity),
    categoryId: input.categoryId,
    listingDescription: input.description.slice(0, 500_000),
    listingPolicies: {
      fulfillmentPolicyId: input.fulfillmentPolicyId,
      paymentPolicyId: input.paymentPolicyId,
      returnPolicyId: input.returnPolicyId,
    },
    pricingSummary: {
      price: { currency: input.currency, value: centsToEbayValue(input.priceCents) },
    },
    merchantLocationKey: input.merchantLocationKey,
  };
}

/**
 * eBay SKUs allow up to 50 characters and exclude some punctuation. Our
 * generated SKUs are already safe; this guards against imported values.
 */
export function toEbaySku(sku: string): string {
  return sku.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 50);
}
