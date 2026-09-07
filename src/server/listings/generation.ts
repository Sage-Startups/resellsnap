/**
 * Listing generation pipeline.
 *
 * Runs inside the worker, in four separable stages so each can be tested and
 * retried on its own:
 *   1. analyse photos          → `AIAnalysis` + `ItemFact` inferences
 *   2. generate master listing → `Listing`
 *   3. adapt per platform      → `ListingVariant` × 4
 *   4. price                   → `PriceSuggestion` × 3
 *
 * Credit accounting sits outside this file: the job runner debits once when a
 * job is accepted and refunds exactly once if it ultimately fails.
 */
import {
  ConfidenceLevel,
  FactSource,
  ItemStatus,
  PlatformKey,
  Tone,
} from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  AnalysisResultSchema,
  ANALYSIS_JSON_SCHEMA,
  getAIProvider,
  MasterListingSchema,
  MASTER_LISTING_JSON_SCHEMA,
  PlatformVariantSchema,
  PLATFORM_VARIANT_JSON_SCHEMA,
  type AnalysisResult,
  type InferredField,
} from '@/server/ai';
import { PROMPT_KEYS, renderPrompt } from '@/server/ai/prompts';
import { ALL_PLATFORM_KEYS, PLATFORM_NAMES } from '@/server/marketplace/registry';
import { getStorage } from '@/server/storage';
import { formatFactsForPrompt, FACT_LABELS, type FactRecord } from '@/server/items/facts';
import { generatePriceSuggestions } from '@/server/pricing/engine';
import { isVariantComplete, validateVariant } from './validation';

/** Resolves the published prompt version for a key, or throws. */
async function resolvePrompt(key: string) {
  const template = await prisma.promptTemplate.findUnique({
    where: { key },
    include: { publishedVersion: true },
  });

  const version = template?.publishedVersion;
  if (!template || !version) {
    // Never fall back to a draft: a draft must not run in production.
    throw new Error(`No published prompt version for "${key}". Publish one in the admin prompt studio.`);
  }

  return { templateId: template.id, version };
}

export interface AnalyzeResult {
  analysisId: string;
  result: AnalysisResult;
  usage: { inputTokens: number; outputTokens: number; imageCount: number; estimatedCostMicros: number; durationMs: number; model: string; provider: string };
  blocked: boolean;
  blockReason?: string;
}

/** Stage 1 — analyse all photos together. */
export async function analyzeItem(itemId: string, aiJobId: string): Promise<AnalyzeResult> {
  const item = await prisma.item.findUniqueOrThrow({
    where: { id: itemId },
    include: {
      photos: { where: { status: 'PROCESSED' }, orderBy: { position: 'asc' } },
      facts: true,
    },
  });

  if (item.photos.length === 0) {
    throw new Error('This item has no processed photos to analyse.');
  }

  const { version } = await resolvePrompt(PROMPT_KEYS.IMAGE_ANALYSIS);
  const storage = getStorage();

  // Images are read as bytes and sent inline; the bucket stays private and no
  // customer photo is ever exposed at a public URL.
  const images = [];
  for (const photo of item.photos.slice(0, 12)) {
    const data = await storage.getObject(photo.objectKey);
    images.push({ data, contentType: photo.contentType });
  }

  const facts: FactRecord[] = item.facts.map((fact) => ({
    key: fact.key,
    value: fact.value,
    source: fact.source,
    confirmed: fact.confirmed,
  }));

  const completion = await getAIProvider().complete({
    operation: PROMPT_KEYS.IMAGE_ANALYSIS,
    systemPrompt: version.systemPrompt,
    userPrompt: renderPrompt(version.userTemplate, {
      sellerFacts: formatFactsForPrompt(facts),
      categoryHint: item.categoryHint ?? 'not supplied',
      photoCount: images.length,
    }),
    images,
    jsonSchema: version.outputSchema as object,
    schemaName: 'item_analysis',
    validator: AnalysisResultSchema,
    maxOutputTokens: 3000,
  });

  const result = completion.data;

  // A BLOCK-severity safety flag stops the pipeline and raises a moderation
  // record rather than producing a listing for a prohibited item.
  const blocking = result.safetyFlags.find((flag) => flag.severity === 'BLOCK');

  const analysis = await prisma.aIAnalysis.create({
    data: {
      itemId,
      aiJobId,
      promptVersionId: version.id,
      model: completion.usage.model,
      provider: completion.usage.provider,
      result: result as never,
      photoWarnings: result.photoWarnings as never,
      safetyFlags: result.safetyFlags as never,
      suggestedQuestions: result.suggestedQuestions as never,
    },
  });

  await persistInferences(itemId, result);

  if (result.safetyFlags.length > 0) {
    await prisma.moderationFlag.createMany({
      data: result.safetyFlags.map((flag) => ({
        workspaceId: item.workspaceId,
        itemId,
        reason: mapSafetyCategory(flag.category),
        detail: flag.message.slice(0, 500),
        raisedBy: 'ai_safety',
      })),
    });
  }

  return {
    analysisId: analysis.id,
    result,
    usage: completion.usage,
    blocked: Boolean(blocking),
    blockReason: blocking?.message,
  };
}

function mapSafetyCategory(category: string) {
  switch (category) {
    case 'COUNTERFEIT_RISK':
      return 'SUSPECTED_COUNTERFEIT' as const;
    case 'PROHIBITED_ITEM':
    case 'WEAPON':
    case 'HAZARDOUS_MATERIAL':
    case 'RECALLED_PRODUCT':
    case 'REGULATED_GOOD':
      return 'PROHIBITED_CATEGORY' as const;
    case 'PERSONAL_DATA_VISIBLE':
      return 'UNSAFE_CONTENT' as const;
    default:
      return 'OTHER' as const;
  }
}

/**
 * Writes inferences as `AI_INFERENCE` facts.
 *
 * A seller-confirmed fact is never overwritten. An inference that contradicts
 * one is dropped, because the seller is the authority on their own item.
 */
async function persistInferences(itemId: string, result: AnalysisResult): Promise<void> {
  const existing = await prisma.itemFact.findMany({ where: { itemId } });
  const confirmedKeys = new Set(
    existing.filter((fact) => fact.source === FactSource.SELLER_CONFIRMED).map((fact) => fact.key),
  );

  const inferences: Array<[string, InferredField | null]> = [
    ['brand', result.brand],
    ['model', result.model],
    ['colour', result.colour],
    ['pattern', result.pattern],
    ['material', result.material],
    ['style', result.style],
    ['size', result.sizeVisible],
  ];

  for (const [key, inference] of inferences) {
    if (!inference || confirmedKeys.has(key)) continue;

    await prisma.itemFact.upsert({
      where: { itemId_key: { itemId, key } },
      create: {
        itemId,
        key,
        value: inference.value,
        source: FactSource.AI_INFERENCE,
        confidence: inference.confidence as ConfidenceLevel,
        evidence: inference.evidence || null,
        confirmed: false,
      },
      update: {
        value: inference.value,
        source: FactSource.AI_INFERENCE,
        confidence: inference.confidence as ConfidenceLevel,
        evidence: inference.evidence || null,
        confirmed: false,
      },
    });
  }

  // Questions the seller still needs to answer become explicit
  // NEEDS_CONFIRMATION rows so the review screen can highlight them.
  for (const [index, question] of result.suggestedQuestions.slice(0, 6).entries()) {
    const key = `question_${index + 1}`;
    if (confirmedKeys.has(key)) continue;
    await prisma.itemFact.upsert({
      where: { itemId_key: { itemId, key } },
      create: {
        itemId,
        key,
        value: question,
        source: FactSource.NEEDS_CONFIRMATION,
        confirmed: false,
      },
      update: { value: question, source: FactSource.NEEDS_CONFIRMATION, confirmed: false },
    });
  }
}

/** Stage 2 — the reusable master listing. */
export async function generateMasterListing(input: {
  itemId: string;
  tone: Tone;
}): Promise<{ listingId: string; usage: { inputTokens: number; outputTokens: number; estimatedCostMicros: number; durationMs: number; model: string; provider: string } }> {
  const item = await prisma.item.findUniqueOrThrow({
    where: { id: input.itemId },
    include: { facts: true, analyses: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  const { version } = await resolvePrompt(PROMPT_KEYS.MASTER_LISTING);
  const analysis = item.analyses[0];

  const facts: FactRecord[] = item.facts.map((fact) => ({
    key: fact.key,
    value: fact.value,
    source: fact.source,
    confidence: fact.confidence,
    evidence: fact.evidence,
    confirmed: fact.confirmed,
  }));

  const completion = await getAIProvider().complete({
    operation: PROMPT_KEYS.MASTER_LISTING,
    systemPrompt: version.systemPrompt,
    userPrompt: renderPrompt(version.userTemplate, {
      sellerFacts: formatFactsForPrompt(facts),
      analysis: analysis ? summariseAnalysis(analysis.result as unknown as AnalysisResult) : '(no analysis available)',
      tone: toneLabel(input.tone),
    }),
    jsonSchema: version.outputSchema as object,
    schemaName: 'master_listing',
    validator: MasterListingSchema,
    maxOutputTokens: 2500,
  });

  const data = completion.data;

  const listing = await prisma.listing.upsert({
    where: { itemId: input.itemId },
    create: {
      itemId: input.itemId,
      tone: input.tone,
      title: data.title,
      description: data.description,
      conditionSummary: data.conditionSummary,
      defectDisclosure: data.defectDisclosure || null,
      includedItems: data.includedItems || null,
      measurements: data.measurements || null,
      attributes: data.attributes as never,
      searchTerms: data.searchTerms as never,
    },
    update: {
      tone: input.tone,
      title: data.title,
      description: data.description,
      conditionSummary: data.conditionSummary,
      defectDisclosure: data.defectDisclosure || null,
      includedItems: data.includedItems || null,
      measurements: data.measurements || null,
      attributes: data.attributes as never,
      searchTerms: data.searchTerms as never,
    },
  });

  await prisma.listingRevision.create({
    data: {
      listingId: listing.id,
      origin: 'ai',
      summary: 'Master listing generated',
      snapshot: data as never,
    },
  });

  await prisma.item.update({
    where: { id: input.itemId },
    data: { title: data.title.slice(0, 140) },
  });

  return { listingId: listing.id, usage: completion.usage };
}

/** Stage 3 — one variant per platform, driven by the admin-owned template. */
export async function generatePlatformVariant(input: {
  itemId: string;
  listingId: string;
  platform: PlatformKey;
  tone: Tone;
}): Promise<{ variantId: string; usage: { inputTokens: number; outputTokens: number; estimatedCostMicros: number; durationMs: number; model: string; provider: string } }> {
  const [listing, item, platform] = await Promise.all([
    prisma.listing.findUniqueOrThrow({ where: { id: input.listingId } }),
    prisma.item.findUniqueOrThrow({ where: { id: input.itemId }, include: { facts: true } }),
    prisma.platform.findUniqueOrThrow({
      where: { key: input.platform },
      include: { templates: { where: { isActive: true }, orderBy: { version: 'desc' }, take: 1 } },
    }),
  ]);

  const template = platform.templates[0];
  if (!template) throw new Error(`No active template for ${input.platform}`);

  const { version } = await resolvePrompt(PROMPT_KEYS.PLATFORM_VARIANT);

  const facts: FactRecord[] = item.facts.map((fact) => ({
    key: fact.key,
    value: fact.value,
    source: fact.source,
    confirmed: fact.confirmed,
  }));

  const completion = await getAIProvider().complete({
    operation: PROMPT_KEYS.PLATFORM_VARIANT,
    systemPrompt: version.systemPrompt,
    userPrompt: renderPrompt(version.userTemplate, {
      platformName: PLATFORM_NAMES[input.platform],
      platformRules: describeTemplate(template),
      masterListing: JSON.stringify(
        {
          title: listing.title,
          description: listing.description,
          conditionSummary: listing.conditionSummary,
          defectDisclosure: listing.defectDisclosure,
          includedItems: listing.includedItems,
          measurements: listing.measurements,
          attributes: listing.attributes,
          searchTerms: listing.searchTerms,
        },
        null,
        2,
      ),
      sellerFacts: formatFactsForPrompt(facts),
      tone: toneLabel(input.tone),
    }),
    jsonSchema: version.outputSchema as object,
    schemaName: 'platform_variant',
    validator: PlatformVariantSchema,
    maxOutputTokens: 2500,
  });

  const data = completion.data;

  // Hard-enforce the limits rather than trusting the model to have obeyed them.
  const title = data.title.slice(0, template.titleMaxLength);
  const description = data.description.slice(0, template.descriptionMaxLength);
  const fields = clampFields(data.fields, template.maxHashtags);

  const issues = validateVariant({
    platform: input.platform,
    title,
    description,
    fields,
    template,
  });

  const variant = await prisma.listingVariant.upsert({
    where: { listingId_platform: { listingId: input.listingId, platform: input.platform } },
    create: {
      listingId: input.listingId,
      platform: input.platform,
      title,
      description,
      fields: fields as never,
      tone: input.tone,
      issues: issues as never,
      isComplete: isVariantComplete(issues),
      templateVersion: template.version,
    },
    update: {
      title,
      description,
      fields: fields as never,
      tone: input.tone,
      issues: issues as never,
      isComplete: isVariantComplete(issues),
      templateVersion: template.version,
    },
  });

  await prisma.listingRevision.create({
    data: {
      listingId: input.listingId,
      variantId: variant.id,
      platform: input.platform,
      origin: 'ai',
      summary: `${PLATFORM_NAMES[input.platform]} variant generated`,
      snapshot: { title, description, fields } as never,
    },
  });

  return { variantId: variant.id, usage: completion.usage };
}

/** Stage 4 — price suggestions, using the transparent source hierarchy. */
export async function generatePricing(itemId: string): Promise<{ unavailable: boolean; reason?: string }> {
  const item = await prisma.item.findUniqueOrThrow({
    where: { id: itemId },
    include: { facts: true, listing: true },
  });

  const summary = item.facts
    .filter((fact) => fact.confirmed || fact.confidence === ConfidenceLevel.HIGH)
    .map((fact) => `${FACT_LABELS[fact.key] ?? fact.key}: ${fact.value}`)
    .join('\n');

  const outcome = await generatePriceSuggestions({
    itemId,
    workspaceId: item.workspaceId,
    currency: item.currency,
    itemSummary: summary || item.listing?.title || item.title,
    searchQuery: item.listing?.title ?? item.title,
    categoryHint: item.categoryHint,
    desiredMinPriceCents: item.desiredMinPriceCents,
    acquisitionCostCents: item.acquisitionCostCents,
  });

  for (const suggestion of outcome.suggestions) {
    // A price the seller has edited is theirs; regeneration must not clobber it.
    const existing = await prisma.priceSuggestion.findUnique({
      where: { itemId_strategy: { itemId, strategy: suggestion.strategy } },
    });
    if (existing?.userEdited) continue;

    await prisma.priceSuggestion.upsert({
      where: { itemId_strategy: { itemId, strategy: suggestion.strategy } },
      create: { itemId, ...suggestion },
      update: { ...suggestion },
    });
  }

  return { unavailable: outcome.unavailable, reason: outcome.unavailableReason };
}

/** Runs the whole pipeline for one item. Used by the worker. */
export async function runFullGeneration(input: {
  itemId: string;
  aiJobId: string;
  tone: Tone;
  onUsage: (usage: {
    operation: string;
    inputTokens: number;
    outputTokens: number;
    imageCount?: number;
    estimatedCostMicros: number;
    durationMs: number;
    model: string;
    provider: string;
  }) => Promise<void>;
}): Promise<{ blocked: boolean; blockReason?: string }> {
  const analysis = await analyzeItem(input.itemId, input.aiJobId);
  await input.onUsage({ operation: 'image_analysis', ...analysis.usage });

  if (analysis.blocked) {
    await prisma.item.update({
      where: { id: input.itemId },
      data: { status: ItemStatus.DRAFT },
    });
    logger.warn('Generation stopped by a blocking safety flag', { itemId: input.itemId });
    return { blocked: true, blockReason: analysis.blockReason };
  }

  const master = await generateMasterListing({ itemId: input.itemId, tone: input.tone });
  await input.onUsage({ operation: 'master_listing', imageCount: 0, ...master.usage });

  for (const platform of ALL_PLATFORM_KEYS) {
    const variant = await generatePlatformVariant({
      itemId: input.itemId,
      listingId: master.listingId,
      platform,
      tone: input.tone,
    });
    await input.onUsage({ operation: `variant_${platform.toLowerCase()}`, imageCount: 0, ...variant.usage });
  }

  await generatePricing(input.itemId);

  await prisma.item.update({
    where: { id: input.itemId },
    data: { status: ItemStatus.READY },
  });

  await prisma.listingStatusEvent.create({
    data: {
      itemId: input.itemId,
      toStatus: ItemStatus.READY,
      source: 'system',
      note: 'Listing drafts generated',
    },
  });

  return { blocked: false };
}

// --- helpers ---------------------------------------------------------------

function toneLabel(tone: Tone): string {
  const labels: Record<Tone, string> = {
    STRAIGHTFORWARD: 'Straightforward — plain, factual, no embellishment',
    FRIENDLY: 'Friendly — warm and conversational, still honest',
    VINTAGE: 'Vintage — period-aware language for retro and second-hand character',
    MINIMAL: 'Minimal — as few words as possible while staying complete',
  };
  return labels[tone];
}

function describeTemplate(template: {
  titleMaxLength: number;
  descriptionMaxLength: number;
  maxHashtags: number;
  requiredFields: unknown;
  toneRules: string;
  guidance: string | null;
}): string {
  const required = Array.isArray(template.requiredFields)
    ? (template.requiredFields as string[]).join(', ')
    : 'none';

  return [
    `Title character limit: ${template.titleMaxLength}`,
    `Description character limit: ${template.descriptionMaxLength}`,
    `Maximum hashtags: ${template.maxHashtags}`,
    `Required fields: ${required}`,
    `Tone rules: ${template.toneRules}`,
    template.guidance ? `Additional guidance: ${template.guidance}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function clampFields(
  fields: Record<string, string | string[]>,
  maxHashtags: number,
): Record<string, string | string[]> {
  const output: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'hashtags' && Array.isArray(value)) {
      output[key] = maxHashtags === 0 ? [] : value.slice(0, maxHashtags);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function summariseAnalysis(result: AnalysisResult): string {
  const lines: string[] = [`Item type: ${result.itemType}`];

  const describe = (label: string, field: InferredField | null) => {
    if (!field) return;
    lines.push(`${label}: ${field.value} [confidence ${field.confidence}${field.evidence ? `; ${field.evidence}` : ''}]`);
  };

  describe('Brand', result.brand);
  describe('Model', result.model);
  describe('Colour', result.colour);
  describe('Pattern', result.pattern);
  describe('Material', result.material);
  describe('Style', result.style);
  describe('Visible size', result.sizeVisible);

  lines.push(`Condition observed: ${result.conditionSummary}`);
  for (const evidence of result.conditionEvidence) {
    lines.push(`- ${evidence.severity}: ${evidence.description}`);
  }
  if (result.searchKeywords.length > 0) {
    lines.push(`Keywords observed: ${result.searchKeywords.join(', ')}`);
  }

  return lines.join('\n');
}
