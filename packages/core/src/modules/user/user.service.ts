import type { User } from '@openpanel/db/src/prisma-client';
import type { ServiceDeps, Services } from '../../services';

// Explicit `Promise<User>` return type, not inferred: Prisma's
// `findUniqueOrThrow` returns a chainable "fluent" client (PromiseLike, plus
// relation-loading methods), which does not unify with the plain
// `Promise<User>` a `.then(...)` wrapper would declare.
export function getUserById(deps: ServiceDeps, id: string): Promise<User> {
  return deps.db.user.findUniqueOrThrow({
    where: {
      id,
    },
  });
}

export async function getUserAccount(
  deps: ServiceDeps,
  {
    email,
    provider,
    providerId,
  }: {
    email: string;
    provider: string;
    providerId?: string;
  }
) {
  const res = await deps.db.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: 'insensitive',
      },
    },
    include: {
      accounts: {
        where: {
          provider,
          providerId: providerId ? String(providerId) : undefined,
        },
        take: 1,
      },
    },
  });

  if (!res?.accounts[0]) {
    return null;
  }

  return {
    ...res,
    account: res?.accounts[0],
  };
}

/**
 * Hard delete the user. Cascades clean up sessions, accounts, totp,
 * twoFactorChallenges, members, invites and conversations.
 * Organizations the user created have `createdByUserId`
 * set to null (SetNull); any org left without an admin member is then
 * removed by the organization module's `delete` cron.
 */
export async function deleteUserAccount(
  deps: ServiceDeps,
  userId: string
): Promise<void> {
  await deps.db.user.delete({ where: { id: userId } });
}

/** better-auth's `name`, kept in step with the first and last name. */
export function toDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string {
  return [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ');
}

export async function updateUserProfile(
  deps: ServiceDeps,
  input: {
    userId: string;
    firstName: string;
    lastName: string;
  }
) {
  return deps.db.user.update({
    where: {
      id: input.userId,
    },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      name: toDisplayName(input.firstName, input.lastName),
    },
  });
}

export function createUserService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    getUserById: (id: string): ReturnType<typeof getUserById> =>
      getUserById(deps, id),
    getUserAccount: (
      args: Parameters<typeof getUserAccount>[1]
    ): ReturnType<typeof getUserAccount> => getUserAccount(deps, args),
    deleteUserAccount: (userId: string): Promise<void> =>
      deleteUserAccount(deps, userId),
    updateUserProfile: (
      input: Parameters<typeof updateUserProfile>[1]
    ): ReturnType<typeof updateUserProfile> => updateUserProfile(deps, input),
  };
}
