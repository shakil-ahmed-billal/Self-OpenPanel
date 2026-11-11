import { PrismaClient } from './generated/prisma/client';
import { logger } from './logger';

export * from './generated/prisma/client';

const getPrismaClient = () => {
  // emit: 'event' keeps the engine from writing prisma:error lines straight
  // to stderr, so they flow through pino to the OTLP pipeline instead.
  const client = new PrismaClient({
    // Prisma's default error format splices file, line and a source snippet
    // into messages that reach API clients verbatim. `minimal` keeps our
    // source layout out of a 500.
    errorFormat: 'minimal',
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

  // $on only exists on the base client — keep it before $extends.
  client.$on('error', (event) => {
    logger.error({ target: event.target }, `prisma: ${event.message}`);
  });
  client.$on('warn', (event) => {
    logger.warn({ target: event.target }, `prisma: ${event.message}`);
  });

  const prisma = client.$extends({
    result: {
      organization: {
        subscriptionState: {
          needs: { id: true },
          compute() {
            return 'self_hosted' as const;
          },
        },
        subscriptionStatus: {
          needs: { id: true },
          compute() {
            return 'active';
          },
        },
        hasSubscription: {
          needs: { id: true },
          compute() {
            return false;
          },
        },
        slug: {
          needs: { id: true },
          compute(org) {
            return org.id;
          },
        },
        subscriptionChartEndDate: {
          needs: { id: true },
          compute() {
            return null;
          },
        },
        isActive: {
          needs: { id: true },
          compute() {
            return true;
          },
        },
        isTrial: {
          needs: { id: true },
          compute() {
            return false;
          },
        },
        isCanceled: {
          needs: { id: true },
          compute() {
            return false;
          },
        },
        isWillBeCanceled: {
          needs: { id: true },
          compute() {
            return false;
          },
        },
        isExpired: {
          needs: { id: true },
          compute() {
            return false;
          },
        },
        isExceeded: {
          needs: { id: true },
          compute() {
            return false;
          },
        },
        subscriptionCurrentPeriodStart: {
          needs: { id: true },
          compute() {
            return null;
          },
        },
        subscriptionCurrentPeriodEnd: {
          needs: { id: true },
          compute() {
            return null;
          },
        },
      },
    },
  });

  return prisma;
};

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof getPrismaClient>;
};

export const db = globalForPrisma.prisma ?? getPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
