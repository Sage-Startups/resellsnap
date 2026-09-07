/**
 * Prompt studio test harness.
 *
 * Runs a draft prompt against dedicated fixtures — never against a customer's
 * item, and never against a customer's photograph. That is the whole point:
 * an admin can iterate on a prompt without touching anyone's data, and a draft
 * can never run in production until it is explicitly published.
 */
import { type z } from 'zod';
import { prisma } from '@/lib/db';
import { getAIProvider } from '@/server/ai';
import {
  AnalysisResultSchema,
  MasterListingSchema,
  PlatformVariantSchema,
  PriceEstimateSchema,
} from '@/server/ai/schemas';
import { renderPrompt } from '@/server/ai/prompts';

export interface PromptFixture {
  id: string;
  label: string;
  description: string;
  tokens: Record<string, string | number>;
}

/**
 * Test fixtures. Entirely synthetic: no real seller, no real item, no photo.
 */
export const PROMPT_FIXTURES: PromptFixture[] = [
  {
    id: 'clothing_confirmed',
    label: 'Clothing, well described',
    description: 'A seller who filled in everything: size, material, measurements and flaws.',
    tokens: {
      sellerFacts: [
        '- Category: clothing',
        '- Overall condition: good',
        '- Size: M',
        '- Material: 100% cotton denim',
        '- Measurements: chest 106 cm, length 62 cm, sleeve 61 cm',
        '- Defects, marks or damage: fading at both cuffs; one replaced inner button',
        '- Age or era: 1990s',
      ].join('\n'),
      analysis:
        'Item type: denim trucker jacket\nColour: mid indigo [confidence HIGH; consistent across photos]\nCondition observed: honest wear, cuff fading visible',
      categoryHint: 'clothing',
      photoCount: 5,
      tone: 'Straightforward — plain, factual, no embellishment',
      platformName: 'eBay',
      platformRules:
        'Title character limit: 80\nDescription character limit: 500000\nMaximum hashtags: 0\nRequired fields: categorySuggestion, conditionDescriptor, itemSpecifics',
      masterListing: JSON.stringify(
        { title: 'Vintage 1990s indigo denim trucker jacket — size M', description: 'A 1990s indigo denim trucker jacket in good used condition.' },
        null,
        2,
      ),
      currency: 'USD',
      itemSummary: 'Denim trucker jacket, size M, 1990s, good condition, cotton denim',
      desiredMinPriceCents: 2000,
      acquisitionCostCents: 1200,
    },
  },
  {
    id: 'electronics_untested',
    label: 'Electronics, untested',
    description: 'The hard case: a seller who cannot confirm whether it works.',
    tokens: {
      sellerFacts: [
        '- Category: electronics',
        '- Overall condition: acceptable',
        '- Tested: no',
        '- Working condition: unknown, no power supply to test with',
        '- Defects, marks or damage: scratches on the casing; one missing screw',
      ].join('\n'),
      analysis:
        'Item type: compact audio amplifier\nColour: black [confidence HIGH]\nCondition observed: cosmetic scratching on the top panel',
      categoryHint: 'electronics',
      photoCount: 3,
      tone: 'Straightforward — plain, factual, no embellishment',
      platformName: 'eBay',
      platformRules:
        'Title character limit: 80\nDescription character limit: 500000\nMaximum hashtags: 0\nRequired fields: categorySuggestion, conditionDescriptor, itemSpecifics',
      masterListing: JSON.stringify(
        { title: 'Compact audio amplifier — untested, sold as seen', description: 'Untested, sold as seen for parts or repair.' },
        null,
        2,
      ),
      currency: 'USD',
      itemSummary: 'Compact audio amplifier, untested, cosmetic damage',
      desiredMinPriceCents: '',
      acquisitionCostCents: '',
    },
  },
  {
    id: 'sparse_facts',
    label: 'Barely any detail',
    description: 'A seller who supplied almost nothing — tests whether the prompt invents facts.',
    tokens: {
      sellerFacts: '- Category: other\n- Overall condition: good',
      analysis: 'Item type: ceramic vase\nColour: cream [confidence MEDIUM]',
      categoryHint: 'other',
      photoCount: 2,
      tone: 'Minimal — as few words as possible while staying complete',
      platformName: 'Vinted',
      platformRules:
        'Title character limit: 60\nDescription character limit: 3000\nMaximum hashtags: 0\nRequired fields: category, condition, colour',
      masterListing: JSON.stringify({ title: 'Cream ceramic vase', description: 'Cream ceramic vase in good used condition.' }, null, 2),
      currency: 'USD',
      itemSummary: 'Ceramic vase, cream, good condition',
      desiredMinPriceCents: '',
      acquisitionCostCents: '',
    },
  },
];

/**
 * The four production schemas, keyed by prompt template.
 *
 * Typed as `ZodType<unknown>` because the harness genuinely does not care which
 * shape comes back — it only needs to know whether the draft prompt produced
 * something the production validator would accept.
 */
const VALIDATORS: Record<string, z.ZodType<unknown>> = {
  image_analysis: AnalysisResultSchema,
  master_listing: MasterListingSchema,
  platform_variant: PlatformVariantSchema,
  price_estimate: PriceEstimateSchema,
};

export async function runPromptFixtureTest(
  versionId: string,
  fixtureId: string,
): Promise<{ output: string; durationMs: number }> {
  const version = await prisma.promptVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: { template: { select: { key: true } } },
  });

  const fixture = PROMPT_FIXTURES.find((entry) => entry.id === fixtureId);
  if (!fixture) throw new Error('That fixture does not exist.');

  const validator = VALIDATORS[version.template.key];
  if (!validator) throw new Error(`No validator is registered for "${version.template.key}".`);

  const startedAt = Date.now();

  // Image analysis is exercised without images here: the point of the harness
  // is to check the prompt's structure and honesty rules, not vision quality,
  // and using a customer photograph for that would be indefensible.
  const result = await getAIProvider().complete({
    operation: version.template.key,
    systemPrompt: version.systemPrompt,
    userPrompt: renderPrompt(version.userTemplate, fixture.tokens),
    jsonSchema: version.outputSchema as object,
    schemaName: `${version.template.key}_test`,
    validator,
    maxOutputTokens: 2500,
  });

  return {
    output: JSON.stringify(result.data, null, 2),
    durationMs: Date.now() - startedAt,
  };
}
