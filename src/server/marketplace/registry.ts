/**
 * Platform metadata and seed defaults.
 *
 * The honest baseline for this release:
 *   • eBay ships a real official OAuth + Sell API integration.
 *   • Vinted, Depop and Facebook Marketplace ship export-first. None of them
 *     publishes a public seller API that grants a third-party application
 *     permission to create consumer listings on a seller's behalf, and we do
 *     not scrape, automate their websites or use private mobile APIs.
 *
 * `unavailableReason` is shown verbatim in the UI so the limitation is stated
 * rather than implied.
 */
import { PlatformKey } from '@/generated/prisma/enums';
import type { MarketplaceCapabilities } from './types';

export interface PlatformSeed {
  key: PlatformKey;
  name: string;
  sellerUrl: string;
  sortOrder: number;
  capabilities: MarketplaceCapabilities;
  unavailableReason: string | null;
  template: {
    titleMaxLength: number;
    descriptionMaxLength: number;
    maxPhotos: number;
    maxHashtags: number;
    requiredFields: string[];
    toneRules: string;
    feePercentBps: number;
    feeFixedCents: number;
    exportFormats: string[];
    regions: string[];
    guidance: string;
  };
}

export const PLATFORM_SEEDS: PlatformSeed[] = [
  {
    key: PlatformKey.EBAY,
    name: 'eBay',
    sellerUrl: 'https://www.ebay.com/sh/lst/active',
    sortOrder: 1,
    capabilities: {
      canConnect: true,
      canCreateDraft: true,
      canPublish: true,
      canUpdate: true,
      canEnd: true,
      canReadListings: true,
      canReadOrders: true,
      canFetchComparables: false,
    },
    unavailableReason: null,
    template: {
      titleMaxLength: 80,
      descriptionMaxLength: 500_000,
      maxPhotos: 12,
      maxHashtags: 0,
      requiredFields: ['categorySuggestion', 'conditionDescriptor', 'itemSpecifics'],
      toneRules:
        'Factual and keyword-accurate without stuffing. Lead the title with the item type and the attributes a buyer searches for: brand (only if confirmed), item type, model, size, colour, material. No promotional words, no punctuation runs, no ALL CAPS. The description should be scannable with short paragraphs and an explicit condition section.',
      // eBay's final value fee varies by category; ~13.25% + $0.30 is a common
      // default. Admins edit this per deployment.
      feePercentBps: 1325,
      feeFixedCents: 30,
      exportFormats: ['TEXT', 'JSON', 'CSV', 'PHOTO_ZIP'],
      regions: ['US', 'GB', 'DE', 'AU', 'CA'],
      guidance:
        'Direct publishing uses the official eBay Sell APIs. Business policies (payment, returns, fulfilment) and an inventory location must exist on the eBay account before an offer can be published.',
    },
  },
  {
    key: PlatformKey.VINTED,
    name: 'Vinted',
    sellerUrl: 'https://www.vinted.com/items/new',
    sortOrder: 2,
    capabilities: {
      canConnect: false,
      canCreateDraft: false,
      canPublish: false,
      canUpdate: false,
      canEnd: false,
      canReadListings: false,
      canReadOrders: false,
      canFetchComparables: false,
    },
    unavailableReason:
      'Vinted does not offer a public seller API that permits a third-party application to create listings on your behalf. ResellSnap AI prepares the listing and photos so you can paste them into Vinted in a few seconds.',
    template: {
      titleMaxLength: 60,
      descriptionMaxLength: 3000,
      maxPhotos: 20,
      maxHashtags: 0,
      requiredFields: ['category', 'condition', 'colour'],
      toneRules:
        'Natural, friendly and concise — how a person describes something to another person. No hashtags. No keyword lists. State condition plainly and mention any flaws early. Measurements matter to Vinted buyers; include them when supplied.',
      feePercentBps: 0,
      feeFixedCents: 0,
      exportFormats: ['TEXT', 'JSON', 'CSV', 'PHOTO_ZIP'],
      regions: ['US', 'GB', 'FR', 'DE', 'ES', 'IT'],
      guidance:
        'Vinted charges the buyer rather than the seller in most markets, so the estimated seller fee here is zero. Verify against current Vinted terms for your market.',
    },
  },
  {
    key: PlatformKey.DEPOP,
    name: 'Depop',
    sellerUrl: 'https://www.depop.com/products/create/',
    sortOrder: 3,
    capabilities: {
      canConnect: false,
      canCreateDraft: false,
      canPublish: false,
      canUpdate: false,
      canEnd: false,
      canReadListings: false,
      canReadOrders: false,
      canFetchComparables: false,
    },
    unavailableReason:
      'Depop does not publish an open seller API for third-party listing creation. ResellSnap AI prepares Depop-formatted copy, hashtags and photos for you to upload.',
    template: {
      titleMaxLength: 65,
      descriptionMaxLength: 1000,
      maxPhotos: 8,
      maxHashtags: 5,
      requiredFields: ['category', 'hashtags'],
      toneRules:
        'Style-forward but honest. Lead with the look and the fit, then the facts. Up to five genuinely relevant hashtags — style, era and category only. Never hashtag a brand the seller has not confirmed. No fake scarcity, no "rare" unless the seller says so.',
      feePercentBps: 0,
      feeFixedCents: 0,
      exportFormats: ['TEXT', 'JSON', 'CSV', 'PHOTO_ZIP'],
      regions: ['US', 'GB', 'AU'],
      guidance:
        'Depop payment processing fees are charged by the payment provider. Set the estimated fee to match your current Depop terms.',
    },
  },
  {
    key: PlatformKey.FACEBOOK_MARKETPLACE,
    name: 'Facebook Marketplace',
    sellerUrl: 'https://www.facebook.com/marketplace/create/item',
    sortOrder: 4,
    capabilities: {
      canConnect: false,
      canCreateDraft: false,
      canPublish: false,
      canUpdate: false,
      canEnd: false,
      canReadListings: false,
      canReadOrders: false,
      canFetchComparables: false,
    },
    unavailableReason:
      'Meta does not grant third-party applications permission to create consumer Facebook Marketplace listings. Facebook Login, social sharing and Meta commerce catalog access are different products and none of them authorises this. ResellSnap AI prepares the listing for you to post yourself.',
    template: {
      titleMaxLength: 100,
      descriptionMaxLength: 5000,
      maxPhotos: 10,
      maxHashtags: 0,
      requiredFields: ['category', 'condition'],
      toneRules:
        'Direct, local and practical. Say what it is, what condition it is in, and how collection or delivery works. Short sentences. No hashtags. Assume the buyer is nearby and wants to know if it is still available and when they can collect.',
      feePercentBps: 0,
      feeFixedCents: 0,
      exportFormats: ['TEXT', 'JSON', 'CSV', 'PHOTO_ZIP'],
      regions: ['US', 'GB', 'CA', 'AU'],
      guidance:
        'Local pickup sales on Facebook Marketplace typically carry no platform fee. Shipping-enabled sales may; check current Meta terms.',
    },
  },
];

export function findPlatformSeed(key: PlatformKey): PlatformSeed {
  const seed = PLATFORM_SEEDS.find((entry) => entry.key === key);
  if (!seed) throw new Error(`No platform seed for ${key}`);
  return seed;
}

export const PLATFORM_NAMES: Record<PlatformKey, string> = {
  [PlatformKey.EBAY]: 'eBay',
  [PlatformKey.VINTED]: 'Vinted',
  [PlatformKey.DEPOP]: 'Depop',
  [PlatformKey.FACEBOOK_MARKETPLACE]: 'Facebook Marketplace',
};

export const ALL_PLATFORM_KEYS: PlatformKey[] = [
  PlatformKey.EBAY,
  PlatformKey.VINTED,
  PlatformKey.DEPOP,
  PlatformKey.FACEBOOK_MARKETPLACE,
];
