import { z } from 'zod';

/**
 * Prefix marking an at-rest ciphertext. Mirrors ENCRYPTION_PREFIX in
 * `@openpanel/shared/server/encryption.ts`, duplicated because this file is
 * bundled for the browser and must not pull in the node-only crypto module.
 *
 * Credentials are WRITE-ONLY: the API redacts them on read, so a client never
 * legitimately holds one. Refusing the prefix on input stops a caller from
 * replaying a ciphertext lifted from another integration — `decryptCredential`
 * accepts any `enc:` blob under the single global key, so an accepted ciphertext
 * would be a portable bearer token.
 */
export const ENCRYPTED_SECRET_PREFIX = 'enc:';

export function looksEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_SECRET_PREFIX);
}

export const zWebhookConfig = z.object({
  type: z.literal('webhook'),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()),
  payload: z.record(z.string(), z.unknown()).optional(),
  mode: z.enum(['message', 'javascript']).default('message'),
  javascriptTemplate: z.string().optional(),
});
export type IWebhookConfig = z.infer<typeof zWebhookConfig>;

export const zDiscordConfig = z.object({
  type: z.literal('discord'),
  // The webhook URL is a bearer credential, so it is write-only too: blank on
  // update keeps the stored one.
  url: z.string().url().or(z.literal('')),
});
export type IDiscordConfig = z.infer<typeof zDiscordConfig>;

export const zAppConfig = z.object({
  type: z.literal('app'),
});
export type IAppConfig = z.infer<typeof zAppConfig>;

export const zEmailConfig = z.object({
  type: z.literal('email'),
});
export type IEmailConfig = z.infer<typeof zEmailConfig>;

// Explicit union, the source of truth for narrowing. Deriving it from the
// registry via z.infer can silently widen a member to `{ type: string }`; the
// registry is forced to match this union via `satisfies`.

export type IIntegrationConfig =
  | IDiscordConfig
  | IWebhookConfig
  | IAppConfig
  | IEmailConfig;

export type IIntegrationType = IIntegrationConfig['type'];

// Plugin descriptor registry: each integration declares its capabilities, setup
// style, config schema and catalog metadata once. The server and client
// registries are keyed by the same `type` and forced to cover the union.

export type IIntegrationKind = 'notification' | 'export';

export interface IIntegrationDescriptor<
  TType extends IIntegrationType = IIntegrationType,
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
> {
  type: TType;
  kinds: readonly IIntegrationKind[];
  // 'form' renders a config form.
  setup: 'form';
  configSchema: TSchema;
  catalog: {
    name: string;
    description: string;
    // Pseudo-integrations (app/email) are dispatched by flags, not user-added.
    hidden?: boolean;
  };
}

export const discordDescriptor = {
  type: 'discord',
  kinds: ['notification'],
  setup: 'form',
  configSchema: zDiscordConfig,
  catalog: {
    name: 'Discord',
    description:
      'Connect your Discord server to get notified when new issues are created.',
  },
} as const satisfies IIntegrationDescriptor<'discord', typeof zDiscordConfig>;

export const webhookDescriptor = {
  type: 'webhook',
  kinds: ['notification'],
  setup: 'form',
  configSchema: zWebhookConfig,
  catalog: {
    name: 'Webhook',
    description:
      'Create a webhook to take actions in your own systems when new events are created.',
  },
} as const satisfies IIntegrationDescriptor<'webhook', typeof zWebhookConfig>;

export const appDescriptor = {
  type: 'app',
  kinds: ['notification'],
  setup: 'form',
  configSchema: zAppConfig,
  catalog: {
    name: 'Website',
    description: 'In-app notifications',
    hidden: true,
  },
} as const satisfies IIntegrationDescriptor<'app', typeof zAppConfig>;

export const emailDescriptor = {
  type: 'email',
  kinds: ['notification'],
  setup: 'form',
  configSchema: zEmailConfig,
  catalog: { name: 'Email', description: 'Email notifications', hidden: true },
} as const satisfies IIntegrationDescriptor<'email', typeof zEmailConfig>;

export const INTEGRATION_DESCRIPTORS = [
  discordDescriptor,
  webhookDescriptor,
  appDescriptor,
  emailDescriptor,
] as const;

const descriptorByType = new Map(
  INTEGRATION_DESCRIPTORS.map((d) => [d.type, d] as const)
);

export function isKind(
  config: Pick<IIntegrationConfig, 'type'> | { type?: string },
  kind: IIntegrationKind
): boolean {
  const descriptor = descriptorByType.get(config.type as IIntegrationType);
  return descriptor
    ? (descriptor.kinds as readonly IIntegrationKind[]).includes(kind)
    : false;
}

// Runtime parser for any integration config. Static narrowing always comes
// from the explicit IIntegrationConfig above.
export const zIntegrationConfig = z.union([
  zWebhookConfig,
  zDiscordConfig,
  zAppConfig,
  zEmailConfig,
]);

const zCreateIntegrationBase = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  projectId: z.string().min(1),
});

export const zCreateWebhookIntegration = zCreateIntegrationBase.extend({
  config: zWebhookConfig,
});

export const zCreateDiscordIntegration = zCreateIntegrationBase.extend({
  config: zDiscordConfig,
});

// Compile-time guards: type aliases that fail `tsc` if an invariant breaks.

type Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// Every member of the union must keep a *literal* `type` discriminant. If any
// widens to { type: string }, this drops it and the equality fails.
type LiteralDiscriminant<U> = U extends { type: infer T }
  ? string extends T
    ? never
    : U
  : never;
type _AssertLiteralDiscriminant = Assert<
  Equal<IIntegrationConfig, LiteralDiscriminant<IIntegrationConfig>>
>;

// The descriptor registry must cover exactly the union's types — no missing,
// no extra. Add a config variant but forget its descriptor → compile error.
type _DescriptorTypes = (typeof INTEGRATION_DESCRIPTORS)[number]['type'];
type _AssertDescriptorCoverage = Assert<
  Equal<IIntegrationType, _DescriptorTypes>
>;
