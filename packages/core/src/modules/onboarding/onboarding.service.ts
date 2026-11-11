import { stripTrailingSlash } from '@openpanel/shared';
import type { ServiceDeps, Services } from '../../services';
import { hashClientSecret, newClientSecret } from '../../shared/client-secret';
import {
  getReferrerWithQuery,
  parseReferrer,
} from '../../shared/parse-referrer';
import { getId } from '../../slug-id';
import { getOrganizationById } from '../organization/organization.service';
import { getUserById } from '../user/user.service';
import type {
  IOnboardingProject,
  IOrganizationAttribution,
  IOrganizationAttributionStored,
} from './onboarding.constants';

export async function canSkipOnboarding(
  deps: ServiceDeps,
  userId: string | null | undefined
): Promise<{ canSkip: boolean }> {
  if (!userId) {
    return { canSkip: false };
  }

  const members = await deps.db.member.count({ where: { userId } });
  return { canSkip: members > 0 };
}

export function toStoredAttribution(
  attribution: IOrganizationAttribution | undefined
): IOrganizationAttributionStored | undefined {
  if (!attribution) {
    return undefined;
  }
  const hasAnyValue = Object.values(attribution).some(Boolean);
  if (!hasAnyValue) {
    return undefined;
  }

  const fromReferrer = parseReferrer(attribution.referrer);
  const fromUtm = getReferrerWithQuery(
    attribution.utmSource ? { utm_source: attribution.utmSource } : undefined
  );
  const resolved = fromReferrer.name ? fromReferrer : fromUtm;

  return {
    referrer: attribution.referrer || null,
    referrerName: resolved?.name || null,
    referrerType: resolved?.type || null,
    landingPage: attribution.landingPage || null,
    utmSource: attribution.utmSource || null,
    utmMedium: attribution.utmMedium || null,
    utmCampaign: attribution.utmCampaign || null,
    utmContent: attribution.utmContent || null,
    utmTerm: attribution.utmTerm || null,
    firstSeenAt: attribution.firstSeenAt || null,
  };
}

async function createOrGetOnboardingOrganization(
  deps: ServiceDeps,
  input: IOnboardingProject,
  userId: string
) {
  if (input.organizationId) {
    return await getOrganizationById(deps, input.organizationId);
  }

  if (!input.organization) {
    return null;
  }

  const db = deps.db;
  const organizationId = await getId(deps, 'organization', input.organization);

  // Create the organization and its owner atomically. The `delete` cron
  // treats an organization with no admin member as ownerless and removes it,
  // so an organization must never exist without one.
  const [organization] = await db.$transaction([
    db.organization.create({
      data: {
        id: organizationId,
        name: input.organization,
        createdByUserId: userId,
        timezone: input.timezone,
        attribution: toStoredAttribution(input.attribution),
        // Equal to the id so it is unique; see code migration 26.
        slug: organizationId,
      },
    }),
    db.member.create({
      data: {
        email: (await getUserById(deps, userId)).email,
        organizationId,
        role: 'owner',
        userId,
      },
    }),
  ]);

  return organization;
}

export interface CreateOnboardingProjectResult {
  id: string;
  name: string;
  organizationId: string;
  projectId: string | null;
  type: string;
  secret: string;
  /** Token for the read-only MCP client created alongside; only ever returned here. */
  mcpToken: string;
}

const toMcpToken = (clientId: string, secret: string) =>
  Buffer.from(`${clientId}:${secret}`).toString('base64');

export async function createOnboardingProject(
  deps: ServiceDeps,
  input: IOnboardingProject,
  userId: string
): Promise<CreateOnboardingProjectResult> {
  const types: ('website' | 'app' | 'backend')[] = [];
  if (input.website) {
    types.push('website');
  }
  if (input.app) {
    types.push('app');
  }
  if (input.backend) {
    types.push('backend');
  }

  const organization = await createOrGetOnboardingOrganization(
    deps,
    input,
    userId
  );
  // Only the no-org-identified branch of createOrGetOnboardingOrganization
  // can produce this: the organizationId branch throws (findUniqueOrThrow)
  // rather than returning falsy, so `organization` is always non-null there.
  if (!organization) {
    throw new Error('Organization name or id is required');
  }

  const cors = [...input.cors];
  if (cors.length === 0 && input.website) {
    cors.push('*');
  }

  const db = deps.db;

  const projectId = await getId(deps, 'project', input.project);
  const secret = newClientSecret();
  // MCP only accepts read and root clients, so the write client's token
  // would never work. A read client scoped to this project is created up
  // front; the dashboard shows its token once and never its id or secret.
  const mcpSecret = newClientSecret();
  const [hashedSecret, hashedMcpSecret] = await Promise.all([
    hashClientSecret(secret),
    hashClientSecret(mcpSecret),
  ]);

  // One transaction: a project without its clients would leave the user
  // with an error and no credentials to retry with.
  const { client, mcpClient } = await db.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        id: projectId,
        name: input.project,
        organizationId: organization.id,
        types,
        domain: input.domain ? stripTrailingSlash(input.domain) : null,
        cors: cors.map((c) => stripTrailingSlash(c)),
      },
    });
    const createdClient = await tx.client.create({
      data: {
        name: `${project.name} Client`,
        organizationId: organization.id,
        projectId: project.id,
        type: 'write',
        secret: hashedSecret,
      },
    });
    const createdMcpClient = await tx.client.create({
      data: {
        name: `${project.name} MCP client`,
        organizationId: organization.id,
        projectId: project.id,
        type: 'read',
        secret: hashedMcpSecret,
      },
    });
    return { client: createdClient, mcpClient: createdMcpClient };
  });

  return { ...client, secret, mcpToken: toMcpToken(mcpClient.id, mcpSecret) };
}

export function createOnboardingService(
  _deps: ServiceDeps,
  _services: () => Services
) {
  return {};
}
