import { describe, expect, it } from 'vitest';
import { redact, sanitizeError } from '@/lib/logger';

describe('log redaction', () => {
  it('removes secrets at any depth', () => {
    const redacted = redact({
      user: { email: 'seller@example.com', name: 'Sam' },
      auth: { accessToken: 'ya29.secret', nested: { refreshToken: 'refresh-secret' } },
      safe: 'keep me',
    });

    const serialised = JSON.stringify(redacted);
    expect(serialised).not.toContain('ya29.secret');
    expect(serialised).not.toContain('refresh-secret');
    expect(serialised).not.toContain('seller@example.com');
    expect(serialised).toContain('keep me');
    expect(serialised).toContain('Sam');
  });

  it('redacts authorization headers and cookies', () => {
    const redacted = redact({
      headers: { authorization: 'Bearer abc123', cookie: 'session=xyz', accept: 'application/json' },
    });

    const serialised = JSON.stringify(redacted);
    expect(serialised).not.toContain('abc123');
    expect(serialised).not.toContain('session=xyz');
    expect(serialised).toContain('application/json');
  });

  it('redacts prompt text and object keys', () => {
    const serialised = JSON.stringify(
      redact({ prompt: 'system instructions', objectKey: 'workspaces/abc/items/def/photos/x.jpg' }),
    );

    expect(serialised).not.toContain('system instructions');
    expect(serialised).not.toContain('workspaces/abc');
  });

  it('truncates very long strings so one log line cannot flood the sink', () => {
    const long = 'x'.repeat(5000);
    const output = JSON.stringify(redact({ description: long }));
    expect(output.length).toBeLessThan(1200);
    expect(output).toContain('truncated');
  });

  it('caps array length and recursion depth', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 'too deep' } } } } } } };
    expect(JSON.stringify(redact(deep))).toContain('truncated');

    const wide = redact({ list: Array.from({ length: 200 }, (_, index) => index) });
    expect((wide.list as unknown[]).length).toBe(25);
  });

  it('reduces an error to a bounded message with no stack', () => {
    const error = new Error('Database connection refused at 10.0.0.5:5432');
    const message = sanitizeError(error);

    expect(message).toBe('Database connection refused at 10.0.0.5:5432');
    expect(message).not.toContain('at Object');
  });

  it('falls back for non-error throws', () => {
    expect(sanitizeError(undefined, 'fallback')).toBe('fallback');
    expect(sanitizeError({ weird: true }, 'fallback')).toBe('fallback');
    expect(sanitizeError('a string throw')).toBe('a string throw');
  });
});
