import { describe, expect, it } from 'bun:test';
import { isKind, looksEncrypted } from './integration.constants';

describe('isKind', () => {
  it('matches a declared capability', () => {
    expect(isKind({ type: 'discord' }, 'notification')).toBe(true);
    expect(isKind({ type: 'webhook' }, 'notification')).toBe(true);
  });

  it('returns false for a capability the integration does not have', () => {
    expect(isKind({ type: 'webhook' }, 'export')).toBe(false);
    expect(isKind({ type: 'discord' }, 'export')).toBe(false);
  });

  it('is lenient for empty/unknown config (does not throw)', () => {
    expect(isKind({}, 'notification')).toBe(false);
    expect(isKind({ type: undefined }, 'notification')).toBe(false);
    expect(isKind({ type: 'something-unknown' }, 'notification')).toBe(false);
  });
});

describe('looksEncrypted', () => {
  it('detects the enc: ciphertext prefix', () => {
    expect(looksEncrypted('enc:c29tZS1jaXBoZXJ0ZXh0')).toBe(true);
    expect(looksEncrypted('plaintext-secret')).toBe(false);
  });
});
