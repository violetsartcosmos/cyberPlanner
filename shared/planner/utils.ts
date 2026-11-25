import { routinesFor, routineWeekday, type RoutineTask } from "./routines";

export const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function isExternalTaskId(taskId: string) {
  return taskId.startsWith("google:") || taskId.startsWith("gmail:");
}

export function externalTaskId(source: string, externalId: string) {
  return `${source}:${externalId}`;
}

export function isValidDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && dateKey(parseDate(value)) === value;
}

export function addDays(date: Date, amount: number) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + amount,
    12,
  );
}

export function weekdayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

export function weekDates(date: Date) {
  const monday = addDays(date, -weekdayIndex(date));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function monthDates(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const start = addDays(first, -weekdayIndex(first));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function routineIdsFor(routines: RoutineTask[], weekday: number) {
  return [
    ...routinesFor(routines, "morning", null),
    ...routinesFor(routines, "night", null),
    ...routinesFor(routines, "daily", routineWeekday(weekday)),
  ].map((routine) => String(routine.id));
}

export function dayProgress(date: Date, checked: string[], routines: RoutineTask[]) {
  const ids = new Set(routineIdsFor(routines, weekdayIndex(date)));
  const total = ids.size;
  const completed = new Set(checked.filter((id) => ids.has(id))).size;
  return { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 };
}

