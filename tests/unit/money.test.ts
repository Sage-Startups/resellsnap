import { describe, expect, it } from 'vitest';
import {
  applyBps, calculateFees, formatMoney, formatMoneyRange, parseMoneyToCents,
} from '@/lib/money';

describe('money', () => {
  it('formats US dollars with two decimal places', () => {
    expect(formatMoney(3200)).toBe('$32.00');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(199_99)).toBe('$199.99');
  });

  it('parses the shapes a seller actually types', () => {
    expect(parseMoneyToCents('32')).toBe(3200);
    expect(parseMoneyToCents('32.50')).toBe(3250);
    expect(parseMoneyToCents('$32.50')).toBe(3250);
    expect(parseMoneyToCents('1,299.99')).toBe(129_999);
    // European decimal comma, which sellers paste from other marketplaces.
    expect(parseMoneyToCents('32,50')).toBe(3250);
  });

  it('returns null rather than zero for unparseable input', () => {
    // Returning 0 would silently list an item for nothing.
    expect(parseMoneyToCents('')).toBeNull();
    expect(parseMoneyToCents('abc')).toBeNull();
    expect(parseMoneyToCents('.')).toBeNull();
  });

  it('applies basis points with half-up rounding', () => {
    expect(applyBps(10_000, 1325)).toBe(1325);
    expect(applyBps(3200, 1325)).toBe(424);
    expect(applyBps(0, 1325)).toBe(0);
  });

  it('calculates net proceeds and margin from integer cents only', () => {
    const fees = calculateFees({
      grossCents: 3200,
      feePercentBps: 1325,
      feeFixedCents: 30,
      shippingCents: 450,
      acquisitionCostCents: 900,
    });

    expect(fees.marketplaceFeeCents).toBe(454);
    expect(fees.netProceedsCents).toBe(3200 - 454 - 450);
    expect(fees.marginCents).toBe(3200 - 454 - 450 - 900);
    expect(Number.isInteger(fees.netProceedsCents)).toBe(true);
  });

  it('charges no fee on a zero-value sale', () => {
    const fees = calculateFees({ grossCents: 0, feePercentBps: 1325, feeFixedCents: 30 });
    expect(fees.marketplaceFeeCents).toBe(0);
    expect(fees.marginPercent).toBeNull();
  });

  it('collapses a range to a single figure when both ends match', () => {
    expect(formatMoneyRange(3200, 3200)).toBe('$32.00');
    expect(formatMoneyRange(1200, 4500)).toBe('$12.00 – $45.00');
    expect(formatMoneyRange(null, 4500)).toBeNull();
  });
});
