/**
 * Plain-English vocabulary for how a price was arrived at.
 *
 * Every place a price is shown — the studio panel, a text/JSON/CSV export —
 * must label it as an estimate and say what it is based on and how confident we
 * are. Sharing one table here keeps that wording identical everywhere, so a
 * seller reading an export sees exactly what the app told them on screen.
 */
export const PRICE_SOURCE_LABELS: Record<string, string> = {
  MARKETPLACE_API: 'Official marketplace data',
  USER_HISTORY: 'Your own sales history',
  ADMIN_HEURISTIC: 'Category guideline',
  AI_ESTIMATE: 'AI estimate — no sales data',
};

export const PRICE_CONFIDENCE_LABELS: Record<string, string> = {
  HIGH: 'High confidence',
  MEDIUM: 'Medium confidence',
  LOW: 'Low confidence',
};

/**
 * The one-line qualifier that travels with an exported price. It is never
 * omitted: an unlabelled number in a copy-paste export would read as a
 * valuation, which is precisely what it is not.
 */
export function priceEstimateNote(source: string, confidence: string): string {
  const basis = PRICE_SOURCE_LABELS[source] ?? source;
  const level = PRICE_CONFIDENCE_LABELS[confidence] ?? confidence;
  return `Estimate — basis: ${basis}. ${level}. Not a valuation or an appraisal.`;
}
