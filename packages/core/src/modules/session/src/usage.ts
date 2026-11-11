// After each session_end the owning project's event counter is refreshed,
// at most once an hour per project.

import { cacheablePerDeps } from '../../../cacheable-per-deps';
import type { ServiceDeps } from '../../../services';
import { getProjectEventsCount } from '../../project/project.service';

const INT4_MAX = 2_147_483_647;
const UPDATE_EVENTS_COUNT_CACHE_SECONDS = 60 * 60;

/** Saturating: the columns are INT4 and lifetime counts can exceed them. */
function clampToInt4(count: number): number {
  return Math.min(count, INT4_MAX);
}

export const updateEventsCount = cacheablePerDeps(
  'updateEventsCount',
  async (deps: ServiceDeps, projectId: string): Promise<true | undefined> => {
    const projectEventsCount = await getProjectEventsCount(deps, projectId);
    if (projectEventsCount) {
      // Only a sort key and activity threshold, never billing — clamping is safe.
      await deps.db.project.update({
        where: { id: projectId },
        data: { eventsCount: clampToInt4(projectEventsCount) },
      });
    }

    return true;
  },
  UPDATE_EVENTS_COUNT_CACHE_SECONDS
);
