import { pathOr } from 'ramda';
import type { Logger } from '../../../logger';
import type { IServiceCreateEventPayload } from '../../event/event.service';
import type {
  IChartEvent,
  IChartEventFilter,
} from '../../report/report.constants';
import { testFilterPattern, toFilterPattern } from './filter-regex';

/** Evaluates project event filter predicates against a normalised event payload. */
export function matchEventFilters(
  payload: IServiceCreateEventPayload,
  filters: IChartEventFilter[],
  logger?: Logger
): boolean {
  return filters.every((filter) => {
    const { name, value, operator } = filter;

    if (value.length === 0) {
      return true;
    }

    if (name === 'has_profile') {
      if (value.includes('true')) {
        return payload.profileId !== payload.deviceId;
      }
      return payload.profileId === payload.deviceId;
    }

    const propertyValue = (
      name.startsWith('properties.')
        ? pathOr('', name.split('.'), payload)
        : pathOr('', [name], payload)
    ).trim();

    switch (operator) {
      case 'is':
        return value.includes(propertyValue);
      case 'isNot':
        return !value.includes(propertyValue);
      case 'contains':
        return value.some((val) => propertyValue.includes(String(val)));
      case 'doesNotContain':
        return !value.some((val) => propertyValue.includes(String(val)));
      case 'startsWith':
        return value.some((val) => propertyValue.startsWith(String(val)));
      case 'endsWith':
        return value.some((val) => propertyValue.endsWith(String(val)));
      case 'regex':
        return value.some((val) =>
          testFilterPattern(toFilterPattern(val), propertyValue, logger)
        );
      case 'isNull':
        return propertyValue === '';
      case 'isNotNull':
        return propertyValue !== '';
      case 'gt':
        return value.some((val) => Number(propertyValue) > Number(val));
      case 'lt':
        return value.some((val) => Number(propertyValue) < Number(val));
      case 'gte':
        return value.some((val) => Number(propertyValue) >= Number(val));
      case 'lte':
        return value.some((val) => Number(propertyValue) <= Number(val));
      default:
        return false;
    }
  });
}

/** Returns true if an incoming event matches a chart event filter spec. */
export function matchEvent(
  payload: IServiceCreateEventPayload,
  chartEvent: IChartEvent,
  logger?: Logger
): boolean {
  if (payload.name !== chartEvent.name && chartEvent.name !== '*') {
    return false;
  }

  if (chartEvent.filters.length > 0) {
    return matchEventFilters(payload, chartEvent.filters, logger);
  }

  return true;
}
