import {
  createFileRoute,
  notFound,
  Outlet,
} from '@tanstack/react-router';
import { Building2Icon } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import FeedbackPrompt from '@/components/organization/feedback-prompt';
import { LinkButton } from '@/components/ui/button';

const IGNORE_ORGANIZATION_IDS = ['.well-known', 'onboarding', 'assets'];

const FILE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'bmp',
  'tiff',
  'ico',
  'js',
  'xml',
  'txt',
  'json',
  'webmanifest',
];

const isStaticFile = (path: string) => {
  return FILE_EXTENSIONS.some((extension) => path.endsWith(`.${extension}`));
};

export const Route = createFileRoute('/_app/$organizationId')({
  component: Component,
  beforeLoad: async ({ context, params }) => {
    if (IGNORE_ORGANIZATION_IDS.includes(params.organizationId)) {
      throw notFound();
    }
    if (isStaticFile(params.organizationId)) {
      throw notFound();
    }
    // Single source of truth for "can this user see this org?". myAccess is
    // membership-exempt and returns null for non-members (and non-existent
    // orgs), which we surface as a not-found page. Real errors (network/500)
    // reject and fall through to the errorComponent. Runs before child routes,
    // so it short-circuits settings/index/billing/members/project.
    const access = await context.queryClient.fetchQuery(
      context.trpc.organization.myAccess.queryOptions({
        organizationId: params.organizationId,
      })
    );
    if (access === null) {
      throw notFound();
    }
  },
  loader: async ({ context, params }) => {
    // myAccess is already warmed in beforeLoad; only organization.get remains.
    await context.queryClient.prefetchQuery(
      context.trpc.organization.get.queryOptions({
        organizationId: params.organizationId,
      })
    );
  },
  pendingComponent: FullPageLoadingState,
  notFoundComponent: () => (
    <EmptyState
      description="This workspace doesn't exist or you don't have access to it."
      icon={Building2Icon}
      title="Workspace not found"
      variant="page"
    >
      <LinkButton href="/">Go to home</LinkButton>
    </EmptyState>
  ),
});

function Component() {
  return (
    <>
      <Outlet />
      <FeedbackPrompt />
    </>
  );
}
