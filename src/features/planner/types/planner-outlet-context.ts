import type { SessionPage } from "../../../../shared/planner/types";
import type { ExternalTask } from "../../../../shared/planner/types";
import type { Achievement } from "../../../../shared/planner/gamification";
import type { RoutineGroup, RoutineTask } from "../../../../shared/planner/routines";

/** Authenticated values available to the shared planner shell. */
export type AuthenticatedPlannerPage = Extract<SessionPage, { authenticated: true }>;

/** Shared shell and date navigation available to child planner routes. */
export type PlannerOutletContext = {
  page: AuthenticatedPlannerPage;
  selected: string;
  today: string;
  date: Date;
  weekday: number;
  onSelectDate(date: string): void;
  onSelectToday(): void;
};

/** Calendar page data and task actions added by the dashboard/calendar layout. */
export type PlannerCalendarOutletContext = PlannerOutletContext & {
  checks: Record<string, string[]>;
  tasks: ExternalTask[];
  routines: RoutineTask[];
  routineGroups: RoutineGroup[];
  achievements: Achievement[];
  earnedTaskKeys: string[];
  checked: string[];
  externalChecked: string[];
  tasksDisabled: boolean;
  celebration: number;
  onToggleTask(taskId: string): void;
};
