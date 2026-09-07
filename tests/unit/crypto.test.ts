import { describe, expect, it, vi } from 'vitest';
import { decryptSecret, encryptSecret, hashToken, safeEqual, sha256Hex } from '@/lib/crypto';

describe('crypto', () => {
  it('round-trips a secret without altering it', () => {
    const plaintext = 'v^1.1#i^1#f^0#r^0#I^3#p^3#t^Ul4x';
    const encrypted = encryptSecret(plaintext);

    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it('never emits the plaintext in the ciphertext payload', () => {
    const plaintext = 'a-very-recognisable-refresh-token-value';
    const encrypted = encryptSecret(plaintext);
    const serialised = JSON.stringify(encrypted);

    // The whole point of encryption at rest: the stored row must not contain
    // the secret in any form.
    expect(serialised).not.toContain(plaintext);
    expect(serialised).not.toContain('recognisable');
  });

  it('produces a different ciphertext each time for the same input', () => {
    const first = encryptSecret('same-value');
    const second = encryptSecret('same-value');

    // A fresh IV per record means identical secrets are not identifiable as
    // identical in the database.
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.iv).not.toBe(second.iv);
    expect(decryptSecret(first)).toBe(decryptSecret(second));
  });

  it('refuses to decrypt a tampered ciphertext', () => {
    const encrypted = encryptSecret('tamper-me');
    const tampered = { ...encrypted, ciphertext: Buffer.from('different').toString('base64') };

    // GCM authentication is what makes this a hard failure rather than garbage.
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('refuses to decrypt with a wrong auth tag', () => {
    const encrypted = encryptSecret('tamper-me');
    const tampered = { ...encrypted, authTag: Buffer.alloc(16).toString('base64') };

    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('rejects an empty plaintext rather than storing an empty record', () => {
    expect(() => encryptSecret('')).toThrow();
  });

  it('does not log the plaintext during a round trip', () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
    ];

    const plaintext = 'never-log-this-token';
    decryptSecret(encryptSecret(plaintext));

    for (const spy of spies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(plaintext);
      }
      spy.mockRestore();
    }
  });

  it('hashes one-time tokens deterministically and irreversibly', () => {
    const token = 'single-use-reset-token';
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).toHaveLength(64);
  });

  it('compares secrets without leaking length mismatches as a throw', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('hashes buffers and strings identically', () => {
    expect(sha256Hex('hello')).toBe(sha256Hex(Buffer.from('hello')));
  });
});
