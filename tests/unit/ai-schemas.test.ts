import { describe, expect, it } from 'vitest';
import {
  AnalysisResultSchema, MasterListingSchema, PlatformVariantSchema, PriceEstimateSchema,
} from '@/server/ai/schemas';
import { FakeAIProvider } from '@/server/ai/fake-provider';

const validAnalysis = {
  itemType: 'leather trainers',
  categoryPath: ['Shoes'],
  brand: null,
  model: null,
  colour: { value: 'cream', confidence: 'HIGH', evidence: 'consistent across photos' },
  pattern: null,
  material: null,
  style: null,
  sizeVisible: null,
  conditionSummary: 'Used with light wear',
  conditionEvidence: [],
  photoWarnings: [],
  suggestedQuestions: [],
  searchKeywords: [],
  safetyFlags: [],
  notes: '',
};

describe('analysis schema', () => {
  it('accepts a well-formed response', () => {
    expect(AnalysisResultSchema.safeParse(validAnalysis).success).toBe(true);
  });

  it('requires an inference to carry its confidence', () => {
    // An inference without a confidence level would be indistinguishable from
    // a fact, which is the exact failure this product exists to avoid.
    const result = AnalysisResultSchema.safeParse({
      ...validAnalysis,
      brand: { value: 'SomeBrand' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invented confidence level', () => {
    const result = AnalysisResultSchema.safeParse({
      ...validAnalysis,
      brand: { value: 'SomeBrand', confidence: 'CERTAIN', evidence: '' },
    });
    expect(result.success).toBe(false);
  });

  it('allows a null inference, which is how "I cannot tell" is expressed', () => {
    const result = AnalysisResultSchema.safeParse({ ...validAnalysis, brand: null, model: null });
    expect(result.success).toBe(true);
    expect(result.data?.brand).toBeNull();
  });

  it('defaults the evidence string rather than failing on its absence', () => {
    const result = AnalysisResultSchema.safeParse({
      ...validAnalysis,
      brand: { value: 'SomeBrand', confidence: 'LOW' },
    });
    expect(result.success).toBe(true);
    expect(result.data?.brand?.evidence).toBe('');
  });

  it('rejects a missing item type', () => {
    const { itemType: _omitted, ...withoutType } = validAnalysis;
    expect(AnalysisResultSchema.safeParse(withoutType).success).toBe(false);
  });

  it('caps runaway arrays', () => {
    const result = AnalysisResultSchema.safeParse({
      ...validAnalysis,
      searchKeywords: Array.from({ length: 200 }, (_, index) => `keyword-${index}`),
    });
    expect(result.success).toBe(false);
  });

  it('validates safety flag severity', () => {
    const result = AnalysisResultSchema.safeParse({
      ...validAnalysis,
      safetyFlags: [{ category: 'COUNTERFEIT_RISK', severity: 'BLOCK', message: 'Possible replica' }],
    });
    expect(result.success).toBe(true);

    const invalid = AnalysisResultSchema.safeParse({
      ...validAnalysis,
      safetyFlags: [{ category: 'MADE_UP', severity: 'BLOCK', message: 'x' }],
    });
    expect(invalid.success).toBe(false);
  });
});

describe('master listing schema', () => {
  it('requires a substantive title and description', () => {
    expect(MasterListingSchema.safeParse({ title: 'ab', description: 'short' }).success).toBe(false);
  });

  it('accepts a complete listing and defaults the optional fields', () => {
    const result = MasterListingSchema.safeParse({
      title: 'Cream leather trainers',
      description: 'A pair of cream leather trainers in very good used condition.',
      conditionSummary: 'Very good',
    });

    expect(result.success).toBe(true);
    expect(result.data?.searchTerms).toEqual([]);
    expect(result.data?.defectDisclosure).toBe('');
  });
});

describe('price estimate schema', () => {
  it('requires an explanation', () => {
    const result = PriceEstimateSchema.safeParse({
      quickSaleCents: 1000,
      balancedCents: 2000,
      maximiseReturnCents: 3000,
      confidence: 'LOW',
      explanation: 'too short',
    });
    // A number without a stated basis is exactly what this product refuses to
    // show a seller.
    expect(result.success).toBe(false);
  });

  it('rejects a negative price', () => {
    const result = PriceEstimateSchema.safeParse({
      quickSaleCents: -100,
      balancedCents: 2000,
      maximiseReturnCents: 3000,
      confidence: 'LOW',
      explanation: 'An estimate from the confirmed attributes only.',
    });
    expect(result.success).toBe(false);
  });
});

describe('deterministic fixture provider', () => {
  it('produces identical output for identical input', async () => {
    const provider = new FakeAIProvider();
    const request = {
      operation: 'master_listing',
      systemPrompt: 'system',
      userPrompt: 'itemType: leather trainers',
      jsonSchema: {},
      schemaName: 'master_listing',
      validator: MasterListingSchema,
    };

    const first = await provider.complete(request);
    const second = await provider.complete(request);

    expect(first.data).toEqual(second.data);
  });

  it('produces different output for different input', async () => {
    const provider = new FakeAIProvider();
    const base = {
      operation: 'master_listing',
      systemPrompt: 'system',
      jsonSchema: {},
      schemaName: 'master_listing',
      validator: MasterListingSchema,
    };

    const first = await provider.complete({ ...base, userPrompt: 'itemType: trainers' });
    const second = await provider.complete({ ...base, userPrompt: 'itemType: espresso machine' });

    expect(first.data).not.toEqual(second.data);
  });

  it('validates its own fixtures against the production schemas', async () => {
    const provider = new FakeAIProvider();

    const analysis = await provider.complete({
      operation: 'image_analysis',
      systemPrompt: 'system',
      userPrompt: 'Number of photographs supplied: 3',
      jsonSchema: {},
      schemaName: 'image_analysis',
      validator: AnalysisResultSchema,
    });
    expect(analysis.data.itemType).toBeTruthy();

    const variant = await provider.complete({
      operation: 'platform_variant',
      systemPrompt: 'system',
      userPrompt: 'Marketplace: Depop',
      jsonSchema: {},
      schemaName: 'platform_variant',
      validator: PlatformVariantSchema,
    });
    expect(variant.data.title).toBeTruthy();
  });

  it('never claims to have consulted market data', async () => {
    const provider = new FakeAIProvider();
    const price = await provider.complete({
      operation: 'price_estimate',
      systemPrompt: 'system',
      userPrompt: 'Currency: USD',
      jsonSchema: {},
      schemaName: 'price_estimate',
      validator: PriceEstimateSchema,
    });

    expect(price.data.explanation.toLowerCase()).toContain('no marketplace sales data');
    expect(price.data.quickSaleCents).toBeLessThan(price.data.balancedCents);
    expect(price.data.balancedCents).toBeLessThan(price.data.maximiseReturnCents);
  });

  it('fails loudly for an operation it has no fixture for', async () => {
    const provider = new FakeAIProvider();
    await expect(
      provider.complete({
        operation: 'unknown_operation',
        systemPrompt: 'system',
        userPrompt: 'x',
        jsonSchema: {},
        schemaName: 'x',
        validator: MasterListingSchema,
      }),
    ).rejects.toThrow(/no fixture/i);
  });
});
