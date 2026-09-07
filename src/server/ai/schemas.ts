/**
 * Structured-output contracts for the AI pipeline.
 *
 * Every model response is validated against these before it touches the
 * database. Prose is never parsed with regular expressions; if the model
 * returns something outside the schema, the job retries and then fails loudly
 * rather than writing a guess into a listing.
 */
import { z } from 'zod';

export const ConfidenceSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** An inferred value that must carry its own uncertainty and justification. */
export const InferredFieldSchema = z.object({
  value: z.string().max(400),
  confidence: ConfidenceSchema,
  /** e.g. "logo visible in photo 2". Empty string when there is no evidence. */
  evidence: z.string().max(400).default(''),
});
export type InferredField = z.infer<typeof InferredFieldSchema>;

export const PhotoWarningSchema = z.object({
  photoIndex: z.number().int().min(0).max(23),
  kind: z.enum(['BLURRY', 'LOW_LIGHT', 'OVEREXPOSED', 'DUPLICATE', 'OBSTRUCTED', 'MISSING_ANGLE']),
  message: z.string().max(300),
});
export type PhotoWarning = z.infer<typeof PhotoWarningSchema>;

export const SafetyFlagSchema = z.object({
  category: z.enum([
    'COUNTERFEIT_RISK',
    'PROHIBITED_ITEM',
    'RECALLED_PRODUCT',
    'HAZARDOUS_MATERIAL',
    'WEAPON',
    'REGULATED_GOOD',
    'PERSONAL_DATA_VISIBLE',
    'OTHER',
  ]),
  severity: z.enum(['INFO', 'WARNING', 'BLOCK']),
  message: z.string().max(400),
});
export type SafetyFlag = z.infer<typeof SafetyFlagSchema>;

export const ConditionEvidenceSchema = z.object({
  description: z.string().max(300),
  photoIndex: z.number().int().min(0).max(23).nullable(),
  severity: z.enum(['COSMETIC', 'MINOR', 'SIGNIFICANT']),
});

/**
 * Image analysis result.
 *
 * Note what is *not* here: no authentication verdict, no "verified genuine", no
 * claim about hidden damage or functionality. The model reports what is visible
 * and how sure it is; the seller supplies everything else.
 */
export const AnalysisResultSchema = z.object({
  /** Generic type such as "leather trainers" — never a brand claim on its own. */
  itemType: z.string().min(1).max(120),
  categoryPath: z.array(z.string().max(60)).max(6).default([]),

  brand: InferredFieldSchema.nullable().default(null),
  model: InferredFieldSchema.nullable().default(null),
  colour: InferredFieldSchema.nullable().default(null),
  pattern: InferredFieldSchema.nullable().default(null),
  material: InferredFieldSchema.nullable().default(null),
  style: InferredFieldSchema.nullable().default(null),
  sizeVisible: InferredFieldSchema.nullable().default(null),

  conditionSummary: z.string().max(600),
  conditionEvidence: z.array(ConditionEvidenceSchema).max(12).default([]),

  photoWarnings: z.array(PhotoWarningSchema).max(12).default([]),
  /** Questions the seller should answer before publishing. */
  suggestedQuestions: z.array(z.string().max(240)).max(10).default([]),
  searchKeywords: z.array(z.string().max(60)).max(25).default([]),
  safetyFlags: z.array(SafetyFlagSchema).max(8).default([]),

  /** Free-text notes for the reviewer. Not shown as fact. */
  notes: z.string().max(800).default(''),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

export const MasterListingSchema = z.object({
  title: z.string().min(3).max(140),
  description: z.string().min(20).max(6000),
  conditionSummary: z.string().min(3).max(1000),
  defectDisclosure: z.string().max(1500).default(''),
  includedItems: z.string().max(800).default(''),
  measurements: z.string().max(800).default(''),
  attributes: z.record(z.string().max(60), z.string().max(300)).default({}),
  searchTerms: z.array(z.string().max(60)).max(25).default([]),
});
export type MasterListing = z.infer<typeof MasterListingSchema>;

export const PlatformVariantSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(8000),
  /** Platform-specific extras: category, item specifics, hashtags, condition. */
  fields: z.record(z.string().max(60), z.union([z.string().max(2000), z.array(z.string().max(200)).max(30)])).default({}),
});
export type PlatformVariant = z.infer<typeof PlatformVariantSchema>;

export const PriceEstimateSchema = z.object({
  quickSaleCents: z.number().int().nonnegative().max(100_000_000),
  balancedCents: z.number().int().nonnegative().max(100_000_000),
  maximiseReturnCents: z.number().int().nonnegative().max(100_000_000),
  confidence: ConfidenceSchema,
  /** Must describe the reasoning; must not cite sales data the model invented. */
  explanation: z.string().min(10).max(600),
});
export type PriceEstimate = z.infer<typeof PriceEstimateSchema>;

// --- JSON Schema documents handed to the provider --------------------------
// Kept as plain objects (rather than generated from Zod) so an admin editing a
// prompt version in the studio can see and version the exact schema sent.

export const ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'itemType',
    'categoryPath',
    'brand',
    'model',
    'colour',
    'pattern',
    'material',
    'style',
    'sizeVisible',
    'conditionSummary',
    'conditionEvidence',
    'photoWarnings',
    'suggestedQuestions',
    'searchKeywords',
    'safetyFlags',
    'notes',
  ],
  properties: {
    itemType: { type: 'string' },
    categoryPath: { type: 'array', items: { type: 'string' } },
    brand: { $ref: '#/$defs/inferred' },
    model: { $ref: '#/$defs/inferred' },
    colour: { $ref: '#/$defs/inferred' },
    pattern: { $ref: '#/$defs/inferred' },
    material: { $ref: '#/$defs/inferred' },
    style: { $ref: '#/$defs/inferred' },
    sizeVisible: { $ref: '#/$defs/inferred' },
    conditionSummary: { type: 'string' },
    conditionEvidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'photoIndex', 'severity'],
        properties: {
          description: { type: 'string' },
          photoIndex: { type: ['integer', 'null'] },
          severity: { type: 'string', enum: ['COSMETIC', 'MINOR', 'SIGNIFICANT'] },
        },
      },
    },
    photoWarnings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['photoIndex', 'kind', 'message'],
        properties: {
          photoIndex: { type: 'integer' },
          kind: {
            type: 'string',
            enum: ['BLURRY', 'LOW_LIGHT', 'OVEREXPOSED', 'DUPLICATE', 'OBSTRUCTED', 'MISSING_ANGLE'],
          },
          message: { type: 'string' },
        },
      },
    },
    suggestedQuestions: { type: 'array', items: { type: 'string' } },
    searchKeywords: { type: 'array', items: { type: 'string' } },
    safetyFlags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'severity', 'message'],
        properties: {
          category: {
            type: 'string',
            enum: [
              'COUNTERFEIT_RISK',
              'PROHIBITED_ITEM',
              'RECALLED_PRODUCT',
              'HAZARDOUS_MATERIAL',
              'WEAPON',
              'REGULATED_GOOD',
              'PERSONAL_DATA_VISIBLE',
              'OTHER',
            ],
          },
          severity: { type: 'string', enum: ['INFO', 'WARNING', 'BLOCK'] },
          message: { type: 'string' },
        },
      },
    },
    notes: { type: 'string' },
  },
  $defs: {
    inferred: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['value', 'confidence', 'evidence'],
      properties: {
        value: { type: 'string' },
        confidence: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
        evidence: { type: 'string' },
      },
    },
  },
} as const;

export const MASTER_LISTING_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'description',
    'conditionSummary',
    'defectDisclosure',
    'includedItems',
    'measurements',
    'attributes',
    'searchTerms',
  ],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    conditionSummary: { type: 'string' },
    defectDisclosure: { type: 'string' },
    includedItems: { type: 'string' },
    measurements: { type: 'string' },
    attributes: { type: 'object', additionalProperties: { type: 'string' } },
    searchTerms: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const PLATFORM_VARIANT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'fields'],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    fields: {
      type: 'object',
      additionalProperties: {
        anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
      },
    },
  },
} as const;

export const PRICE_ESTIMATE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['quickSaleCents', 'balancedCents', 'maximiseReturnCents', 'confidence', 'explanation'],
  properties: {
    quickSaleCents: { type: 'integer' },
    balancedCents: { type: 'integer' },
    maximiseReturnCents: { type: 'integer' },
    confidence: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
    explanation: { type: 'string' },
  },
} as const;
