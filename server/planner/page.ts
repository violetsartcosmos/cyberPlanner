import { dateKey, isValidDateKey } from "../../shared/planner/utils";
import type { PlannerPage } from "../../shared/planner/types";
import { getMissingConfiguration, getSignedInEmail } from "../auth/service";
import { getPointsSummary } from "../points/service";
import { getPlannerSnapshot, getPlannerTasks } from "./service";
import { getGamification } from "../gamification/service";

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
  const tasks = getPlannerTasks(selected);
  const pointsRequest = url.searchParams.get("taskKeys") === "visible"
    ? tasks.then((visible) => getPointsSummary(selected, visible))
    : getPointsSummary(selected);
  const [{ plannerDays, ...gamification }, plannerTasks, points] = await Promise.all([
    getGamification(today), tasks, pointsRequest,
  ]);
  const planner = await getPlannerSnapshot(selected, plannerDays, plannerTasks);
  return { authenticated: true, email, today, selected, ...planner, ...points, ...gamification };
}
