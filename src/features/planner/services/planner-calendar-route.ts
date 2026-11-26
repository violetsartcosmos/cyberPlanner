import type { LoaderFunctionArgs } from "react-router";
import { dateKey, isValidDateKey } from "../../../../shared/planner/utils";
import type { PlannerCalendarData } from "../../../../shared/planner/types";

/**
 * Loads selected-date routine, task and achievement data for calendar pages.
 * @param args - The cancellable dashboard or calendar loader request.
 * @returns The calendar resources, or null when the user is not signed in.
 */
export async function plannerCalendarLoader({ request }: LoaderFunctionArgs): Promise<PlannerCalendarData | null> {
  const requestedDate = new URL(request.url).searchParams.get("date");
  const selected = requestedDate && isValidDateKey(requestedDate) ? requestedDate : dateKey(new Date());
  const response = await fetch(`/api/planner/calendar?date=${encodeURIComponent(selected)}`, {
    signal: request.signal,
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    const error = await response.json() as { error: string };
    throw new Error(error.error);
  }
  return await response.json() as PlannerCalendarData;
}
