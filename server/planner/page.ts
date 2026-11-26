import { dateKey, isValidDateKey } from "../../shared/planner/utils";
import type { ExternalTask, PlannerPage } from "../../shared/planner/types";
import { getMissingConfiguration, getSignedInEmail } from "../auth/service";
import { getPointsSummary } from "../points/service";
import { getPlannerTasks } from "./service";
import { getGamification } from "../gamification/service";
import { getTherapyPlan } from "./therapy";
import { dateString } from "../db/client";
import { listJournals } from "../journals/service";
import { listRoutineCompletions } from "../routines/service";

type RoutineCompletion = { day: Date; taskId: number };

export async function getPlannerSnapshot(date: string, completions?: RoutineCompletion[], plannerTasks?: ExternalTask[]) {
  const [checks, journals, tasks] = await Promise.all([
    completions ?? listRoutineCompletions(),
    listJournals(),
    plannerTasks ?? getPlannerTasks(date),
  ]);
  const checksByDate: Record<string, string[]> = {};
  for (const check of checks) {
    const key = dateString(check.day);
    (checksByDate[key] ??= []).push(String(check.taskId));
  }
  return {
    checks: checksByDate,
    journalDates: journals.filter((journal) => journal.content.trim()).map((journal) => dateString(journal.day)),
    journal: journals.find((journal) => dateString(journal.day) === date)?.content ?? "",
    tasks,
  };
}

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
  const [{ completions, ...gamification }, plannerTasks, points, therapy] = await Promise.all([
    getGamification(today), tasks, pointsRequest, getTherapyPlan(selected),
  ]);
  const planner = await getPlannerSnapshot(selected, completions, plannerTasks);
  return { authenticated: true, email, today, selected, ...planner, ...points, ...gamification, therapy };
}
