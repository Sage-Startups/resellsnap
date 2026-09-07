/**
 * Listing completeness and platform-limit validation.
 *
 * Runs on every save and before every publish or export, so a seller sees a
 * problem in the studio rather than in a marketplace rejection email.
 */
import type { PlatformKey } from '@/generated/prisma/enums';
import type { PlatformTemplate } from '@/lib/models';

export interface ValidationIssue {
  /** `error` blocks publish/export; `warning` does not. */
  level: 'error' | 'warning';
  field: string;
  message: string;
}

export interface VariantValidationInput {
  platform: PlatformKey;
  title: string;
  description: string;
  fields: Record<string, unknown>;
  template: Pick<
    PlatformTemplate,
    'titleMaxLength' | 'descriptionMaxLength' | 'maxHashtags' | 'requiredFields'
  >;
}

/** Patterns that make a listing look like spam or a policy violation. */
const KEYWORD_STUFFING = /(\b\w{3,}\b)(?:[\s,]+\1\b){3,}/i;
const SHOUTING = /\b[A-Z]{5,}\b(?:\s+\b[A-Z]{5,}\b){2,}/;
const FAKE_SCARCITY = /\b(last one ever|only \d+ left in the world|never available again|final chance forever)\b/i;
const AUTHENTICATION_CLAIM = /\b(100% authentic guaranteed|authenticity guaranteed|verified genuine|certified authentic)\b/i;

export function validateVariant(input: VariantValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { template } = input;

  const title = input.title.trim();
  const description = input.description.trim();

  if (title.length === 0) {
    issues.push({ level: 'error', field: 'title', message: 'A title is required.' });
  } else if (title.length < 10) {
    issues.push({
      level: 'warning',
      field: 'title',
      message: 'This title is very short. Buyers search by item type, brand and size.',
    });
  }

  if (title.length > template.titleMaxLength) {
    issues.push({
      level: 'error',
      field: 'title',
      message: `The title is ${title.length} characters. The limit is ${template.titleMaxLength}.`,
    });
  }

  if (description.length === 0) {
    issues.push({ level: 'error', field: 'description', message: 'A description is required.' });
  } else if (description.length < 40) {
    issues.push({
      level: 'warning',
      field: 'description',
      message: 'A longer description usually sells faster and reduces buyer questions.',
    });
  }

  if (description.length > template.descriptionMaxLength) {
    issues.push({
      level: 'error',
      field: 'description',
      message: `The description is ${description.length} characters. The limit is ${template.descriptionMaxLength}.`,
    });
  }

  const combined = `${title}\n${description}`;

  if (KEYWORD_STUFFING.test(combined)) {
    issues.push({
      level: 'error',
      field: 'description',
      message: 'This looks like keyword stuffing, which most marketplaces penalise. Remove the repetition.',
    });
  }
  if (SHOUTING.test(combined)) {
    issues.push({
      level: 'warning',
      field: 'title',
      message: 'Long runs of capital letters read as spam. Use sentence case.',
    });
  }
  if (FAKE_SCARCITY.test(combined)) {
    issues.push({
      level: 'error',
      field: 'description',
      message: 'Remove artificial scarcity claims — they breach marketplace policy.',
    });
  }
  if (AUTHENTICATION_CLAIM.test(combined)) {
    issues.push({
      level: 'error',
      field: 'description',
      message:
        'Remove the authenticity guarantee. Nothing here has been authenticated, and claiming otherwise puts your account at risk.',
    });
  }

  const requiredFields = Array.isArray(template.requiredFields)
    ? (template.requiredFields as unknown[]).filter((value): value is string => typeof value === 'string')
    : [];

  for (const field of requiredFields) {
    const value = input.fields[field];
    const isEmpty =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0);
    if (isEmpty) {
      issues.push({
        level: 'error',
        field,
        message: `${humanizeField(field)} is required for ${humanizePlatform(input.platform)}.`,
      });
    }
  }

  const hashtags = input.fields.hashtags;
  if (Array.isArray(hashtags)) {
    if (template.maxHashtags === 0 && hashtags.length > 0) {
      issues.push({
        level: 'error',
        field: 'hashtags',
        message: `${humanizePlatform(input.platform)} listings should not contain hashtags.`,
      });
    } else if (hashtags.length > template.maxHashtags) {
      issues.push({
        level: 'error',
        field: 'hashtags',
        message: `Use at most ${template.maxHashtags} hashtags. There are currently ${hashtags.length}.`,
      });
    }
  }

  return issues;
}

export function isVariantComplete(issues: ValidationIssue[]): boolean {
  return !issues.some((issue) => issue.level === 'error');
}

export interface MasterValidationInput {
  title: string;
  description: string;
  conditionSummary: string;
  hasPhotos: boolean;
  hasPrice: boolean;
  hasConfirmedCondition: boolean;
  unconfirmedInferences: number;
}

/** Item-level readiness, shown as the completeness checklist. */
export function validateMaster(input: MasterValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!input.hasPhotos) {
    issues.push({ level: 'error', field: 'photos', message: 'Add at least one photo.' });
  }
  if (input.title.trim().length < 5) {
    issues.push({ level: 'error', field: 'title', message: 'The master title needs more detail.' });
  }
  if (input.description.trim().length < 30) {
    issues.push({ level: 'error', field: 'description', message: 'The master description needs more detail.' });
  }
  if (input.conditionSummary.trim().length < 5) {
    issues.push({
      level: 'error',
      field: 'conditionSummary',
      message: 'Describe the condition — every marketplace requires it.',
    });
  }
  if (!input.hasConfirmedCondition) {
    issues.push({
      level: 'warning',
      field: 'condition',
      message: 'Confirm the overall condition so the drafts describe it accurately.',
    });
  }
  if (!input.hasPrice) {
    issues.push({ level: 'warning', field: 'price', message: 'Set a price before you publish or export.' });
  }
  if (input.unconfirmedInferences > 0) {
    issues.push({
      level: 'warning',
      field: 'facts',
      message: `${input.unconfirmedInferences} AI ${input.unconfirmedInferences === 1 ? 'inference has' : 'inferences have'} not been confirmed yet. Review them before publishing.`,
    });
  }

  return issues;
}

function humanizeField(field: string): string {
  const labels: Record<string, string> = {
    categorySuggestion: 'A category',
    categoryId: 'A category',
    category: 'A category',
    conditionDescriptor: 'A condition',
    condition: 'A condition',
    itemSpecifics: 'Item specifics',
    hashtags: 'Hashtags',
    colour: 'A colour',
    pickupNotes: 'Pickup or delivery notes',
  };
  return labels[field] ?? field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

function humanizePlatform(platform: PlatformKey): string {
  const labels: Record<string, string> = {
    EBAY: 'eBay',
    VINTED: 'Vinted',
    DEPOP: 'Depop',
    FACEBOOK_MARKETPLACE: 'Facebook Marketplace',
  };
  return labels[platform] ?? platform;
}
