import type { PlannerPage } from "../../../../shared/planner/types";

export type AuthenticatedPlannerPage = Extract<PlannerPage, { authenticated: true }>;

export type PlannerOutletContext = {
  page: AuthenticatedPlannerPage;
  selected: string;
  today: string;
  date: Date;
  weekday: number;
  checked: string[];
  externalChecked: string[];
  tasksDisabled: boolean;
  onToggleTask(taskId: string): void;
  onSelectDate(date: string): void;
  onSelectToday(): void;
};
