// Authorization is data-dependent: an update must authorize against the
// EXISTING row's scope, not the attacker-controlled input, so the access
// assertions live here with the business logic.

import { TRPCBadRequestError, TRPCForbiddenError } from '../../rpc/errors';
import type { ServiceDeps, Services } from '../../services';
import { getOrganizationAccess } from '../../shared/access-lookups';
import { getAccessChecks } from '../auth/auth.service';
import { BASE_INTEGRATIONS } from '../notification/notification.service';
import type { IIntegrationConfig } from './integration.constants';
import {
  carryOverConfigSecrets,
  encryptConfigSecrets,
  findEncryptedSecretField,
  findMissingSecretFields,
  getServerIntegration,
  redactIntegration,
} from './src/registry';

// A client never legitimately holds a ciphertext (see redactIntegration), so
// one arriving on the wire is an attempt to replay a secret lifted from another
// integration into an attacker-chosen destination.
function rejectEncryptedSecrets(config: unknown) {
  const field = findEncryptedSecretField(config);
  if (field) {
    throw new TRPCBadRequestError(
      `\`${field}\` looks like a stored, already-encrypted value. Paste the real credential, or leave it blank to keep the current one.`
    );
  }
}

// Assert the user can act on the project at `level`, and return the project's
// organizationId (still stored on the integration for org-level queries/cascades).
async function assertProjectAccessAndGetOrg(
  deps: ServiceDeps,
  userId: string,
  projectId: string,
  level: 'read' | 'write'
) {
  const { requireProjectAccess } = await getAccessChecks();
  await requireProjectAccess({ userId, projectId, level });

  const db = deps.db;
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { organizationId: true },
  });
  return project.organizationId;
}

// Access check for an existing integration of either scope. Project-scoped rows
// go through the project ladder; legacy org-wide rows (projectId null) have no
// project access level to consult, so a write to one — it is shared by every
// project in the org — is admin-tier, while a read only needs membership.
async function assertIntegrationAccess(
  userId: string,
  integration: { projectId: string | null; organizationId: string },
  level: 'read' | 'write'
) {
  const { requireProjectAccess, requireOrganizationAdmin } =
    await getAccessChecks();

  if (integration.projectId) {
    await requireProjectAccess({
      userId,
      projectId: integration.projectId,
      level,
    });
    return;
  }

  if (level === 'write') {
    await requireOrganizationAdmin({
      userId,
      organizationId: integration.organizationId,
      message: 'Only organization admins can change an org-wide integration',
    });
    return;
  }

  const access = await getOrganizationAccess({
    userId,
    organizationId: integration.organizationId,
  });
  if (!access) {
    throw new TRPCForbiddenError('You do not have access to this integration');
  }
}

export async function getIntegrationById(
  deps: ServiceDeps,
  userId: string,
  id: string
) {
  const db = deps.db;
  const integration = await db.integration.findUniqueOrThrow({
    where: { id },
  });

  await assertIntegrationAccess(userId, integration, 'read');

  return redactIntegration(integration);
}

export async function listIntegrationsForProject(
  deps: ServiceDeps,
  userId: string,
  projectId: string
) {
  const organizationId = await assertProjectAccessAndGetOrg(
    deps,
    userId,
    projectId,
    'read'
  );

  const db = deps.db;
  const integrations = await db.integration.findMany({
    where: {
      // Plus legacy org-wide integrations (projectId null).
      OR: [{ projectId }, { projectId: null, organizationId }],
      config: {
        not: {},
      },
    },
  });

  return [...BASE_INTEGRATIONS, ...integrations.map(redactIntegration)];
}

// Credentials are write-only: they are encrypted at rest and never travel back
// to a client. `read` on a project is bare membership, so returning the stored
// ciphertext would hand every project member the org's object-store keys — and
// because `decryptCredential` accepts any `enc:` blob under the single global
// key, that ciphertext is a replayable bearer token, not an opaque handle.
//
// Shared create/update path for any form-configured integration. All per-type
// behavior (validation, connection test, credential encryption) is delegated to
// the integration's server plugin — adding a new integration needs no change here.
export async function upsertIntegration(
  deps: ServiceDeps,
  userId: string,
  input: {
    id?: string;
    name: string;
    projectId: string;
    config: IIntegrationConfig;
  }
) {
  // Authorize first. For an update, authorize against the EXISTING integration's
  // scope — not the attacker-controlled input.projectId — so a user with access
  // to one project can't update another project's integration in the same org.
  rejectEncryptedSecrets(input.config);

  const db = deps.db;

  let organizationId: string;
  let storedConfig: unknown;
  if (input.id) {
    const existing = await db.integration.findUniqueOrThrow({
      where: { id: input.id },
      select: { projectId: true, organizationId: true, config: true },
    });
    await assertIntegrationAccess(userId, existing, 'write');
    organizationId = existing.organizationId;
    storedConfig = existing.config;
  } else {
    organizationId = await assertProjectAccessAndGetOrg(
      deps,
      userId,
      input.projectId,
      'write'
    );
  }

  // A blank secret means "keep the stored one" — the client can't resubmit what
  // it was never given. On create there is nothing to fall back to.
  const submitted = input.id
    ? carryOverConfigSecrets(input.config, storedConfig)
    : input.config;

  const missing = findMissingSecretFields(submitted);
  if (missing.length > 0) {
    throw new TRPCBadRequestError(
      `Missing credential${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`
    );
  }

  const plugin = getServerIntegration(submitted.type);

  const validation = plugin.validateConfig?.(submitted);
  if (validation && !validation.valid) {
    throw new TRPCBadRequestError(`Invalid config: ${validation.error}`);
  }

  // Test the connection with the real credentials before saving. `submitted`
  // may carry a still-encrypted value forward from the stored row; the adapters
  // decrypt on construction, so this works for both new and carried-over keys.
  const testResult = await plugin.testConnection?.(submitted, deps.config);
  if (testResult && !testResult.success) {
    throw new TRPCBadRequestError(`Failed to connect: ${testResult.error}`);
  }

  const config = encryptConfigSecrets(deps.config.encryptionKey, submitted);

  // The stored row holds more than the caller sent: secrets carried over from
  // the previous config, and the encrypted ones as ciphertext. Neither may go
  // back out.
  const row = input.id
    ? await db.integration.update({
        where: { id: input.id, organizationId },
        data: { name: input.name, config },
      })
    : await db.integration.create({
        data: {
          name: input.name,
          organizationId,
          projectId: input.projectId,
          config,
        },
      });

  return redactIntegration(row);
}

// Generic, registry-driven connection test. Gated on project write access:
// it makes the server connect outbound to a caller-supplied destination with
// caller-supplied credentials, so it must not be reachable by anyone who
// merely holds a session.
export async function testIntegrationConnection(
  deps: ServiceDeps,
  userId: string,
  input: { projectId: string; config: IIntegrationConfig }
) {
  const { requireProjectAccess } = await getAccessChecks();
  await requireProjectAccess({
    userId,
    projectId: input.projectId,
    level: 'write',
  });
  rejectEncryptedSecrets(input.config);

  return (
    (await getServerIntegration(input.config.type).testConnection?.(
      input.config,
      deps.config
    )) ?? { success: true }
  );
}

export async function deleteIntegration(
  deps: ServiceDeps,
  userId: string,
  id: string
) {
  const db = deps.db;
  const integration = await db.integration.findUniqueOrThrow({
    where: { id },
  });

  await assertIntegrationAccess(userId, integration, 'write');

  await db.integration.delete({
    where: { id },
  });

  // The deleted row still carries its config; the client only needs to know
  // which id is gone.
  return { id };
}

/** A module function's signature with its leading `ServiceDeps` dropped. */
type WithoutDeps<T extends (deps: ServiceDeps, ...args: never[]) => unknown> =
  T extends (deps: ServiceDeps, ...args: infer A) => infer R
    ? (...args: A) => R
    : never;

export function createIntegrationService(
  deps: ServiceDeps,
  _services: () => Services
) {
  const getById: WithoutDeps<typeof getIntegrationById> = (...args) =>
    getIntegrationById(deps, ...args);
  const listForProject: WithoutDeps<typeof listIntegrationsForProject> = (
    ...args
  ) => listIntegrationsForProject(deps, ...args);
  const upsert: WithoutDeps<typeof upsertIntegration> = (...args) =>
    upsertIntegration(deps, ...args);
  const testConnection: WithoutDeps<typeof testIntegrationConnection> = (
    ...args
  ) => testIntegrationConnection(deps, ...args);
  const deleteBound: WithoutDeps<typeof deleteIntegration> = (...args) =>
    deleteIntegration(deps, ...args);

  return {
    getById,
    listForProject,
    upsert,
    testConnection,
    delete: deleteBound,
  };
}
