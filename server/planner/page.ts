import { dateKey, isValidDateKey } from "../../shared/planner/utils";
import type { PlannerPage } from "../../shared/planner/types";
import { getMissingConfiguration, getSignedInEmail } from "../auth/service";
import { getPointsSummary } from "../points/service";
import { getPlannerJournal, getPlannerNote, getPlannerSnapshot } from "./service";
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
  const [planner, note, journal, points, gamification] = await Promise.all([
    getPlannerSnapshot(selected),
    getPlannerNote(selected),
    getPlannerJournal(selected),
    getPointsSummary(selected),
    getGamification(today),
  ]);
  return { authenticated: true, email, today, selected, note, journal, ...planner, ...points, ...gamification };
}
