import { randomBytes, randomUUID } from 'node:crypto';

const SKU_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

/**
 * Internal SKU. One physical item keeps a single SKU across every marketplace
 * variant, which is what makes cross-platform inventory reconciliation possible.
 */
export function generateSku(prefix = 'RS'): string {
  const bytes = randomBytes(6);
  let out = '';
  for (const byte of bytes) {
    out += SKU_ALPHABET[byte % SKU_ALPHABET.length];
  }
  return `${prefix}-${out.slice(0, 3)}-${out.slice(3)}`;
}

export function newId(): string {
  return randomUUID();
}

export function correlationId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Deterministic idempotency key. Same logical operation ⇒ same key ⇒ the unique
 * index refuses the duplicate. This is how credits avoid double-debit.
 */
export function idempotencyKey(...parts: Array<string | number>): string {
  return parts.map((part) => String(part).replace(/:/g, '_')).join(':');
}
