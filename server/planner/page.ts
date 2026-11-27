import { dateKey } from "../../shared/planner/utils";
import { getPointsSummary } from "../points/service";
import { getExternalTasks } from "../external-tasks/service";
import { getProfileSummary } from "../gamification/service";

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
