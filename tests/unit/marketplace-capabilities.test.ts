import { describe, expect, it } from 'vitest';
import { PlatformKey } from '@/generated/prisma/enums';
import { ALL_PLATFORM_KEYS, findPlatformSeed, PLATFORM_SEEDS } from '@/server/marketplace/registry';
import { ExportOnlyAdapter } from '@/server/marketplace/export-adapter';
import { MarketplaceNotSupportedError, NO_CAPABILITIES } from '@/server/marketplace/types';
import { toEbayCondition, toEbayAspects, centsToEbayValue, buildOffer } from '@/server/marketplace/ebay/mapping';
import { EBAY_SCOPES } from '@/server/marketplace/ebay/config';

describe('platform capability declarations', () => {
  it('declares direct publishing only for eBay', () => {
    for (const seed of PLATFORM_SEEDS) {
      if (seed.key === PlatformKey.EBAY) expect(seed.capabilities.canPublish).toBe(true);
      else expect(seed.capabilities.canPublish).toBe(false);
    }
  });

  it('explains why every non-publishing platform cannot publish', () => {
    // A capability that is off without a stated reason is indistinguishable
    // from a bug, both for a seller and for a future maintainer.
    for (const seed of PLATFORM_SEEDS) {
      if (!seed.capabilities.canPublish) {
        expect(seed.unavailableReason).toBeTruthy();
        expect(seed.unavailableReason!.length).toBeGreaterThan(40);
      }
    }
  });

  it('claims no comparable-data access anywhere, because we have none', () => {
    for (const seed of PLATFORM_SEEDS) {
      expect(seed.capabilities.canFetchComparables).toBe(false);
    }
  });

  it('gives every platform an export path', () => {
    for (const seed of PLATFORM_SEEDS) {
      expect(seed.template.exportFormats).toContain('PHOTO_ZIP');
      expect(seed.template.exportFormats).toContain('TEXT');
    }
  });

  it('allows hashtags only where the platform expects them', () => {
    expect(findPlatformSeed(PlatformKey.DEPOP).template.maxHashtags).toBeGreaterThan(0);
    expect(findPlatformSeed(PlatformKey.EBAY).template.maxHashtags).toBe(0);
    expect(findPlatformSeed(PlatformKey.VINTED).template.maxHashtags).toBe(0);
    expect(findPlatformSeed(PlatformKey.FACEBOOK_MARKETPLACE).template.maxHashtags).toBe(0);
  });

  it('covers all four marketplaces', () => {
    expect(ALL_PLATFORM_KEYS).toHaveLength(4);
    for (const key of ALL_PLATFORM_KEYS) expect(() => findPlatformSeed(key)).not.toThrow();
  });
});

describe('export-only adapter', () => {
  const adapter = new ExportOnlyAdapter(PlatformKey.VINTED);

  it('is always usable, because export needs no credentials', () => {
    expect(adapter.isConfigured()).toBe(true);
  });

  it('declares no capabilities at all', () => {
    expect(adapter.declaredCapabilities()).toEqual(NO_CAPABILITIES);
  });

  it('throws rather than pretending to publish', async () => {
    // Silently succeeding here would be the single worst bug this product
    // could ship: a seller would believe an item is live when it is not.
    await expect(adapter.publish()).rejects.toBeInstanceOf(MarketplaceNotSupportedError);
    await expect(adapter.updateListing()).rejects.toBeInstanceOf(MarketplaceNotSupportedError);
    await expect(adapter.endListing()).rejects.toBeInstanceOf(MarketplaceNotSupportedError);
  });

  it('throws rather than inventing comparable sales', async () => {
    await expect(adapter.fetchComparables()).rejects.toBeInstanceOf(MarketplaceNotSupportedError);
  });
});

describe('eBay mapping', () => {
  it('never maps an unknown condition to NEW', () => {
    // Over-stating condition is a policy violation and a refund. When in
    // doubt the mapping must go down, never up.
    expect(toEbayCondition(undefined)).toBe('USED_GOOD');
    expect(toEbayCondition('')).toBe('USED_GOOD');
    expect(toEbayCondition('something unrecognisable')).toBe('USED_GOOD');
  });

  it('maps the seller-facing condition words', () => {
    expect(toEbayCondition('new with tags')).toBe('NEW');
    expect(toEbayCondition('like new')).toBe('LIKE_NEW');
    expect(toEbayCondition('excellent')).toBe('USED_EXCELLENT');
    expect(toEbayCondition('very good')).toBe('USED_VERY_GOOD');
    expect(toEbayCondition('acceptable')).toBe('USED_ACCEPTABLE');
    expect(toEbayCondition('for parts')).toBe('FOR_PARTS_OR_NOT_WORKING');
  });

  it('passes through an exact eBay enum value', () => {
    expect(toEbayCondition('USED_VERY_GOOD')).toBe('USED_VERY_GOOD');
  });

  it('parses item specifics from both shapes the model may return', () => {
    expect(toEbayAspects(['Colour: Cream', 'Size: UK 8'])).toEqual({
      Colour: ['Cream'],
      Size: ['UK 8'],
    });
    expect(toEbayAspects({ Colour: 'Cream', Size: ['UK 8', 'US 9'] })).toEqual({
      Colour: ['Cream'],
      Size: ['UK 8', 'US 9'],
    });
  });

  it('drops malformed specifics rather than sending eBay a broken aspect', () => {
    expect(toEbayAspects(['no colon here', '', ': empty name'])).toEqual({});
    expect(toEbayAspects(null)).toEqual({});
    expect(toEbayAspects('a string')).toEqual({});
  });

  it('formats prices as decimal strings without float drift', () => {
    expect(centsToEbayValue(3200)).toBe('32.00');
    expect(centsToEbayValue(1)).toBe('0.01');
    expect(centsToEbayValue(129_999)).toBe('1299.99');
    // The classic 0.1 + 0.2 case, which is why money is integers here.
    expect(centsToEbayValue(30)).toBe('0.30');
  });

  it('builds an offer with all three required business policies', () => {
    const offer = buildOffer({
      sku: 'RS-ABC-123',
      marketplaceId: 'EBAY_US',
      quantity: 1,
      categoryId: '15709',
      description: 'A description',
      priceCents: 3200,
      currency: 'USD',
      fulfillmentPolicyId: 'f1',
      paymentPolicyId: 'p1',
      returnPolicyId: 'r1',
      merchantLocationKey: 'loc1',
    });

    expect(offer.pricingSummary.price.value).toBe('32.00');
    expect(offer.listingPolicies).toEqual({
      fulfillmentPolicyId: 'f1',
      paymentPolicyId: 'p1',
      returnPolicyId: 'r1',
    });
    expect(offer.format).toBe('FIXED_PRICE');
  });

  it('requests least-privilege scopes', () => {
    // One write scope only. If this list grows, it should be a deliberate,
    // reviewed change.
    const writeScopes = EBAY_SCOPES.filter(
      (scope) => !scope.endsWith('.readonly') && scope !== 'https://api.ebay.com/oauth/api_scope',
    );
    expect(writeScopes).toEqual(['https://api.ebay.com/oauth/api_scope/sell.inventory']);
  });
});
