import { describe, expect, it } from 'vitest';
import { isVariantComplete, validateMaster, validateVariant } from '@/server/listings/validation';
import { PlatformKey } from '@/generated/prisma/enums';

const template = {
  titleMaxLength: 80,
  descriptionMaxLength: 4000,
  maxHashtags: 0,
  requiredFields: ['categorySuggestion', 'conditionDescriptor'],
};

function validate(overrides: Partial<Parameters<typeof validateVariant>[0]> = {}) {
  return validateVariant({
    platform: PlatformKey.EBAY,
    title: 'Cream leather low-top trainers UK 8, very good condition',
    description:
      'Cream leather low-top trainers in very good used condition. Worn a handful of times, with light scuffing on the right toe as pictured.',
    fields: { categorySuggestion: 'Shoes', conditionDescriptor: 'USED_VERY_GOOD' },
    template,
    ...overrides,
  });
}

describe('variant validation', () => {
  it('accepts a well-formed listing', () => {
    const issues = validate();
    expect(issues.filter((issue) => issue.level === 'error')).toHaveLength(0);
    expect(isVariantComplete(issues)).toBe(true);
  });

  it('rejects a title over the platform limit', () => {
    const issues = validate({ title: 'x'.repeat(81) });
    const error = issues.find((issue) => issue.field === 'title' && issue.level === 'error');

    expect(error).toBeDefined();
    expect(error?.message).toContain('81');
    expect(error?.message).toContain('80');
    expect(isVariantComplete(issues)).toBe(false);
  });

  it('accepts a title exactly at the limit', () => {
    const issues = validate({ title: 'x'.repeat(80) });
    expect(issues.some((issue) => issue.field === 'title' && issue.level === 'error')).toBe(false);
  });

  it('rejects a description over the platform limit', () => {
    const issues = validate({ description: 'x'.repeat(4001) });
    expect(
      issues.some((issue) => issue.field === 'description' && issue.level === 'error'),
    ).toBe(true);
  });

  it('flags every missing required field', () => {
    const issues = validate({ fields: {} });
    const errors = issues.filter((issue) => issue.level === 'error');

    expect(errors.some((issue) => issue.field === 'categorySuggestion')).toBe(true);
    expect(errors.some((issue) => issue.field === 'conditionDescriptor')).toBe(true);
  });

  it('treats an empty string and an empty array as missing', () => {
    const issues = validate({
      fields: { categorySuggestion: '   ', conditionDescriptor: [] },
    });
    expect(issues.filter((issue) => issue.level === 'error').length).toBeGreaterThanOrEqual(2);
  });

  it('rejects keyword stuffing', () => {
    const issues = validate({
      description:
        'vintage vintage vintage vintage denim jacket, a genuinely lovely piece with plenty of detail.',
    });
    expect(issues.some((issue) => issue.message.includes('keyword stuffing'))).toBe(true);
  });

  it('rejects an authenticity guarantee', () => {
    // We have authenticated nothing. Claiming otherwise is what gets sellers
    // suspended, so this must be a hard error rather than a warning.
    const issues = validate({
      description:
        'Beautiful bag in excellent condition, 100% authentic guaranteed, from a smoke-free home.',
    });
    const error = issues.find((issue) => issue.message.includes('authenticity guarantee'));

    expect(error).toBeDefined();
    expect(error?.level).toBe('error');
  });

  it('rejects fabricated scarcity', () => {
    const issues = validate({
      description: 'A wonderful piece in good condition. This is the last one ever, act now.',
    });
    expect(issues.some((issue) => issue.message.includes('scarcity'))).toBe(true);
  });

  it('warns about shouting without blocking the listing', () => {
    const issues = validate({
      title: 'CREAM LEATHER TRAINERS SIZE EIGHT BARGAIN',
      description:
        'Cream leather low-top trainers in very good used condition, worn only a handful of times.',
    });
    const shouting = issues.find((issue) => issue.message.includes('capital letters'));

    expect(shouting?.level).toBe('warning');
    expect(isVariantComplete(issues)).toBe(true);
  });

  it('rejects hashtags on a platform that allows none', () => {
    const issues = validate({
      fields: {
        categorySuggestion: 'Shoes',
        conditionDescriptor: 'USED_VERY_GOOD',
        hashtags: ['#preloved'],
      },
    });
    expect(issues.some((issue) => issue.field === 'hashtags' && issue.level === 'error')).toBe(true);
  });

  it('enforces a platform hashtag ceiling', () => {
    const issues = validateVariant({
      platform: PlatformKey.DEPOP,
      title: 'cream leather low tops UK 8',
      description: 'Clean cream low-tops, very good condition. Light scuff on the right toe.',
      fields: { hashtags: ['#a', '#b', '#c', '#d', '#e', '#f'] },
      template: { ...template, maxHashtags: 5, requiredFields: ['hashtags'] },
    });

    const error = issues.find((issue) => issue.field === 'hashtags');
    expect(error?.level).toBe('error');
    expect(error?.message).toContain('5');
  });

  it('allows hashtags within the ceiling', () => {
    const issues = validateVariant({
      platform: PlatformKey.DEPOP,
      title: 'cream leather low tops UK 8',
      description: 'Clean cream low-tops, very good condition. Light scuff on the right toe.',
      fields: { hashtags: ['#preloved', '#secondhand'] },
      template: { ...template, maxHashtags: 5, requiredFields: ['hashtags'] },
    });
    expect(issues.filter((issue) => issue.level === 'error')).toHaveLength(0);
  });
});

describe('master validation', () => {
  const base = {
    title: 'Cream leather low-top trainers — UK 8, very good condition',
    description:
      'Cream leather low-top trainers in very good used condition, worn a handful of times.',
    conditionSummary: 'Very good used condition with light cosmetic wear.',
    hasPhotos: true,
    hasPrice: true,
    hasConfirmedCondition: true,
    unconfirmedInferences: 0,
  };

  it('passes a complete item', () => {
    expect(validateMaster(base).filter((issue) => issue.level === 'error')).toHaveLength(0);
  });

  it('blocks an item with no photos', () => {
    const issues = validateMaster({ ...base, hasPhotos: false });
    expect(issues.some((issue) => issue.field === 'photos' && issue.level === 'error')).toBe(true);
  });

  it('warns, but does not block, on a missing price', () => {
    const issues = validateMaster({ ...base, hasPrice: false });
    const price = issues.find((issue) => issue.field === 'price');

    expect(price?.level).toBe('warning');
  });

  it('warns about unconfirmed AI inferences and counts them', () => {
    const issues = validateMaster({ ...base, unconfirmedInferences: 3 });
    const warning = issues.find((issue) => issue.field === 'facts');

    expect(warning?.level).toBe('warning');
    expect(warning?.message).toContain('3');
  });

  it('uses singular wording for one unconfirmed inference', () => {
    const issues = validateMaster({ ...base, unconfirmedInferences: 1 });
    expect(issues.find((issue) => issue.field === 'facts')?.message).toContain('inference has');
  });
});
