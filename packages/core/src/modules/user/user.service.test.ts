import { beforeEach, expect, mock, test } from 'bun:test';
import { testServices } from '../../../test/service-deps';
import type { ServiceDeps } from '../../services';
import { createUserService } from './user.service';

interface FakeUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

const userStore = new Map<string, FakeUser>();

function makeUser(overrides: Partial<FakeUser> & { id: string }): FakeUser {
  return {
    email: 'a@example.com',
    firstName: null,
    lastName: null,
    ...overrides,
  };
}

const user = {
  findUniqueOrThrow: mock(
    async ({ where: { id } }: { where: { id: string } }) => {
      const found = userStore.get(id);
      if (!found) {
        throw new Error(`user ${id} not found`);
      }
      return found;
    }
  ),
  findFirst: mock(
    async ({
      where,
      include,
    }: {
      where: { email: { equals: string } };
      include?: { accounts?: { where: { provider: string } } };
    }) => {
      const found = [...userStore.values()].find(
        (u) => u.email === where.email.equals
      );
      if (!found) {
        return null;
      }
      return include?.accounts ? { ...found, accounts: [] } : found;
    }
  ),
  update: mock(
    async ({
      where: { id },
      data,
    }: {
      where: { id: string };
      data: Partial<FakeUser>;
    }) => {
      const existing = userStore.get(id);
      if (!existing) {
        throw new Error(`user ${id} not found`);
      }
      const next = { ...existing, ...data };
      userStore.set(id, next);
      return next;
    }
  ),
  delete: mock(async ({ where: { id } }: { where: { id: string } }) => {
    userStore.delete(id);
  }),
};

const subject = createUserService(
  {
    db: { user },
  } as unknown as ServiceDeps,
  testServices()
);

beforeEach(() => {
  userStore.clear();
});

test('getUserById returns the row', async () => {
  userStore.set('user_1', makeUser({ id: 'user_1' }));
  const result = await subject.getUserById('user_1');
  expect(result).toMatchObject({ id: 'user_1' });
});

test('getUserAccount returns null when the matching provider account is missing', async () => {
  userStore.set('user_1', makeUser({ id: 'user_1' }));
  const result = await subject.getUserAccount({
    email: 'a@example.com',
    provider: 'google',
  });
  expect(result).toBeNull();
});

test('updateUserProfile updates first and last name', async () => {
  userStore.set('user_1', makeUser({ id: 'user_1' }));
  const result = await subject.updateUserProfile({
    userId: 'user_1',
    firstName: 'Ralph',
    lastName: 'Wiggum',
  });
  expect(result).toMatchObject({ firstName: 'Ralph', lastName: 'Wiggum' });
});

test('deleteUserAccount deletes the user row', async () => {
  userStore.set('user_1', makeUser({ id: 'user_1' }));

  await subject.deleteUserAccount('user_1');
  expect(userStore.has('user_1')).toBe(false);
});
