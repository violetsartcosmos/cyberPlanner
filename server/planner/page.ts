import { dateKey, isValidDateKey } from "../../shared/planner/utils";
import type { ExternalTask, PlannerPage } from "../../shared/planner/types";
import { getMissingConfiguration, getSignedInEmail } from "../auth/service";
import { getPointsSummary } from "../points/service";
import { getExternalTasks } from "../external-tasks/service";
import { getGamification } from "../gamification/service";
import { dateString } from "../db/client";

type RoutineCompletion = { day: Date; taskId: number };

/**
 * Assembles routine checks and selected-date tasks for the shared UI snapshot.
 * @param completions - Saved routine completions.
 * @param plannerTasks - External tasks visible for the selected date.
 * @returns Planner-owned routine and task state.
 */
export async function getPlannerSnapshot(
  completions: RoutineCompletion[],
  plannerTasks: ExternalTask[],
) {
  const checks = completions;
  const checksByDate: Record<string, string[]> = {};
  for (const check of checks) {
    const key = dateString(check.day);
    (checksByDate[key] ??= []).push(String(check.taskId));
  }
  return {
    checks: checksByDate,
    tasks: plannerTasks,
  };
}

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
  const tasks = getExternalTasks(selected);
  const pointsRequest = url.searchParams.get("taskKeys") === "visible"
    ? tasks.then((visible) => getPointsSummary(selected, visible))
    : getPointsSummary(selected);
  const [{ completions, ...gamification }, plannerTasks, points] = await Promise.all([
    getGamification(today), tasks, pointsRequest,
  ]);
  const planner = await getPlannerSnapshot(completions, plannerTasks);
  return {
    authenticated: true,
    email,
    today,
    selected,
    ...planner,
    ...points,
    ...gamification,
  };
}
