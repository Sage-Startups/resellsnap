/**
 * Money handling.
 *
 * Amounts are integer minor units (cents) plus an ISO 4217 code. The product
 * ships with USD only, but every formatting path takes an explicit currency and
 * locale so adding EUR/GBP later is a data change, not a refactor.
 */
export const DEFAULT_CURRENCY = 'USD';
export const DEFAULT_LOCALE = 'en-US';

export interface Money {
  amountCents: number;
  currency: string;
}

export function money(amountCents: number, currency: string = DEFAULT_CURRENCY): Money {
  return { amountCents: Math.round(amountCents), currency };
}

export function formatMoney(
  amountCents: number,
  currency: string = DEFAULT_CURRENCY,
  locale: string = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

/** Compact form for dashboard tiles: $1.6k, $2.7M. */
export function formatMoneyCompact(
  amountCents: number,
  currency: string = DEFAULT_CURRENCY,
  locale: string = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amountCents / 100);
}

export function formatMoneyRange(
  lowCents: number | null | undefined,
  highCents: number | null | undefined,
  currency: string = DEFAULT_CURRENCY,
  locale: string = DEFAULT_LOCALE,
): string | null {
  if (lowCents == null || highCents == null) return null;
  if (lowCents === highCents) return formatMoney(lowCents, currency, locale);
  return `${formatMoney(lowCents, currency, locale)} – ${formatMoney(highCents, currency, locale)}`;
}

/** Parses "$12.50", "12,50" and "12.5" into cents. Returns null when unusable. */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.,-]/g, '').replace(/,(\d{2})$/, '.$1').replace(/,/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Basis points applied to an amount, rounded half-up. */
export function applyBps(amountCents: number, bps: number): number {
  return Math.round((amountCents * bps) / 10_000);
}

export interface FeeBreakdown {
  grossCents: number;
  marketplaceFeeCents: number;
  shippingCents: number;
  acquisitionCostCents: number;
  netProceedsCents: number;
  marginCents: number;
  marginPercent: number | null;
}

/**
 * Estimated net proceeds. Every input is an estimate supplied by admin-editable
 * fee rules or the seller — the UI labels it as such and never presents it as a
 * guaranteed payout.
 */
export function calculateFees(input: {
  grossCents: number;
  feePercentBps: number;
  feeFixedCents: number;
  shippingCents?: number;
  acquisitionCostCents?: number;
}): FeeBreakdown {
  const gross = Math.max(0, Math.round(input.grossCents));
  const shipping = Math.max(0, Math.round(input.shippingCents ?? 0));
  const acquisition = Math.max(0, Math.round(input.acquisitionCostCents ?? 0));

  const marketplaceFee = gross === 0 ? 0 : applyBps(gross, input.feePercentBps) + input.feeFixedCents;
  const net = gross - marketplaceFee - shipping;
  const margin = net - acquisition;

  return {
    grossCents: gross,
    marketplaceFeeCents: marketplaceFee,
    shippingCents: shipping,
    acquisitionCostCents: acquisition,
    netProceedsCents: net,
    marginCents: margin,
    marginPercent: gross === 0 ? null : Math.round((margin / gross) * 1000) / 10,
  };
}
