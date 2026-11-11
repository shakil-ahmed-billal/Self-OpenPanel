import { describe, expect, it } from 'bun:test';
import {
  carryOverConfigSecrets,
  encryptConfigSecrets,
  findEncryptedSecretField,
  findMissingSecretFields,
  redactConfigSecrets,
} from './registry';

/** The ENCRYPTION_KEY the config loader would hand down. */
const KEY = 'a'.repeat(64);

const encryptSecrets = <C>(config: C): C => encryptConfigSecrets(KEY, config);

const discord = (url: string) =>
  ({
    type: 'discord',
    url,
  }) as const;

const appConfig = { type: 'app' } as const;

describe('config secret handling', () => {
  it('redacts declared secrets so they never reach a client', () => {
    expect(
      redactConfigSecrets(discord('https://discord.com/api/webhooks/1/secret'))
        .url
    ).toBe('');
  });

  it('leaves configs without secrets untouched, by identity', () => {
    // The router returns the row as-is when nothing changed, so identity matters.
    expect(redactConfigSecrets(appConfig)).toBe(appConfig);
  });

  it('is lenient for an empty/unknown config', () => {
    expect(() => redactConfigSecrets({})).not.toThrow();
    expect(() => findEncryptedSecretField({})).not.toThrow();
    expect(findMissingSecretFields({})).toEqual([]);
    expect(findMissingSecretFields({ type: 'nope' })).toEqual([]);
  });

  it('carries a blank secret over from the stored row on update', () => {
    const stored = discord('https://discord.com/api/webhooks/1/secret');
    const submitted = carryOverConfigSecrets(discord(''), stored);
    expect(submitted.url).toBe(stored.url);
  });

  it('does not let a submitted secret be overwritten by the stored one', () => {
    const stored = discord('https://discord.com/api/webhooks/1/old');
    const submitted = carryOverConfigSecrets(
      discord('https://discord.com/api/webhooks/1/new'),
      stored
    );
    expect(submitted.url).toBe('https://discord.com/api/webhooks/1/new');
  });

  it('reports a blank secret with nothing stored to fall back to', () => {
    expect(
      findMissingSecretFields(carryOverConfigSecrets(discord(''), null))
    ).toEqual(['url']);
    expect(
      findMissingSecretFields(discord('https://discord.com/api/webhooks/1/k'))
    ).toEqual([]);
  });

  it('redacts webhook header values but keeps the keys visible', () => {
    const redacted = redactConfigSecrets({
      type: 'webhook',
      url: 'https://acme.test/hook',
      mode: 'message',
      headers: { Authorization: 'Bearer sk-live-123', 'X-Env': 'prod' },
    });

    expect(redacted.headers).toEqual({ Authorization: '', 'X-Env': '' });
    // The destination URL is not redacted: the user typed it and must be able
    // to edit it.
    expect(redacted.url).toBe('https://acme.test/hook');
  });

  it('carries header values over per key, so an edit keeps the others', () => {
    const stored = {
      type: 'webhook',
      url: 'https://acme.test/hook',
      mode: 'message',
      headers: { Authorization: 'Bearer sk-live-123', 'X-Env': 'prod' },
    };
    const submitted = carryOverConfigSecrets(
      {
        ...stored,
        // Authorization came back blank (redacted, untouched); X-Env retyped;
        // a third header added; nothing removed.
        headers: { Authorization: '', 'X-Env': 'staging', 'X-New': 'v' },
      },
      stored
    );

    expect(submitted.headers).toEqual({
      Authorization: 'Bearer sk-live-123',
      'X-Env': 'staging',
      'X-New': 'v',
    });
  });

  it('drops stored header values when the webhook URL changes', () => {
    const stored = {
      type: 'webhook',
      url: 'https://acme.test/hook',
      mode: 'message',
      headers: { Authorization: 'Bearer sk-live-123' },
    };
    const submitted = carryOverConfigSecrets(
      {
        ...stored,
        url: 'https://attacker.test/hook',
        headers: { Authorization: '' },
      },
      stored
    );

    expect(submitted.headers).toEqual({ Authorization: '' });
    expect(findMissingSecretFields(submitted)).toEqual([
      'headers.Authorization',
    ]);
  });

  it('redacts the Discord webhook URL and carries it over when left blank', () => {
    const stored = {
      type: 'discord',
      url: 'https://discord.com/api/webhooks/1/secret',
    };

    expect(redactConfigSecrets(stored).url).toBe('');
    expect(
      carryOverConfigSecrets({ type: 'discord', url: '' }, stored).url
    ).toBe(stored.url);
    expect(findMissingSecretFields({ type: 'discord', url: '' })).toEqual([
      'url',
    ]);
  });

  it('lets a removed header stay removed', () => {
    const stored = {
      type: 'webhook',
      url: 'https://acme.test/hook',
      mode: 'message',
      headers: { Authorization: 'Bearer sk-live-123' },
    };
    const submitted = carryOverConfigSecrets(
      { ...stored, headers: {} },
      stored
    );
    expect(submitted.headers).toEqual({});
  });

  it('does not encrypt redact-only secrets', () => {
    const stored = discord('https://discord.com/api/webhooks/1/secret');
    expect(encryptSecrets(stored).url).toBe(stored.url);
  });

  it('only flags a replayed ciphertext on encrypted fields', () => {
    // A redact-only value is stored in plaintext, so a header that happens to
    // start with "enc:" is just a string, not a replay.
    expect(
      findEncryptedSecretField({
        type: 'webhook',
        url: 'https://acme.test/hook',
        mode: 'message',
        headers: { Authorization: 'enc:not-really' },
      })
    ).toBeUndefined();
  });
});
