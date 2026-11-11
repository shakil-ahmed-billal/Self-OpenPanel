import type { AppRouter } from '@openpanel/core';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

export { handleError } from '@/integrations/trpc/react';

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;

export type IChartData = RouterOutputs['chart']['chart'];
