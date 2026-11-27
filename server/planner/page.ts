import { dateKey, isValidDateKey } from "../../shared/planner/utils";
import type { PlannerPage } from "../../shared/planner/types";
import { getMissingConfiguration, getSignedInEmail } from "../auth/service";
import { getPlannerBalance, getPointsSummary } from "../points/service";
import { getExternalTasks } from "../external-tasks/service";
import { getPlannerHeaderSummary, getProfileSummary } from "../gamification/service";

/**
 * Assembles the remaining combined planner snapshot.
 * @param request - The planner request, including the selected date.
 * @returns The authenticated planner data or sign-in configuration state.
 */
export async function getPlannerPage(request: Request): Promise<PlannerPage> {
  const url = new URL(request.url);
  const authError = url.searchParams.get("authError")?.slice(0, 240) ?? "";
  const missingConfiguration = getMissingConfiguration();
  if (missingConfiguration.length) {
    return { authenticated: false, missingConfiguration, authError };
  }

  const email = await getSignedInEmail(request);
  if (!email) {
    return { authenticated: false, missingConfiguration: [], authError };
  }

  const today = dateKey(new Date());
  const requestedDate = url.searchParams.get("date");
  const selected = requestedDate && isValidDateKey(requestedDate) ? requestedDate : today;
  const [header, points] = await Promise.all([
    getPlannerHeaderSummary(today),
    getPlannerBalance(),
  ]);
  return {
    authenticated: true,
    email,
    today,
    selected,
    ...header,
    ...points,
  };
}

/**
 * Loads the routine and synced-task data used by the dashboard and calendar.
 * @param selected - The selected planner date in YYYY-MM-DD format.
 * @returns The selected-date tasks and calendar progress resources.
 */
export async function getPlannerCalendarPage(selected: string) {
  const today = dateKey(new Date());
  const [profile, tasks] = await Promise.all([
    getProfileSummary(today),
    getExternalTasks(selected),
  ]);
  const points = await getPointsSummary(selected, tasks);
  return {
    ...profile,
    tasks,
    earnedTaskKeys: points.earnedTaskKeys,
    todayPoints: points.todayPoints,
  };
}
