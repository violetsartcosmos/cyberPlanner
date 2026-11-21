import { dailyQuests, morningRoutine, nightRoutine } from "./planner";

export type PlannerData = {
  checks: Record<string, string[]>;
  notes: Record<string, string>;
};

export const STORAGE_KEY = "cyberplanner-v1";
export const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
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

export function dayProgress(date: Date, checked: string[]) {
  const quest = dailyQuests[weekdayIndex(date)];
  const groups: Record<string, readonly string[]> = {
    daily: quest.tasks,
    morning: morningRoutine,
    night: nightRoutine,
  };
  const total =
    quest.tasks.length + morningRoutine.length + nightRoutine.length;
  const completed = checked.filter((id) => {
    const [prefix, index] = id.split("-");
    const items = groups[prefix];
    return items && /^\d+$/.test(index ?? "") && Number(index) < items.length;
  }).length;
  return { completed, total, percent: Math.round((completed / total) * 100) };
}

export function isPlannerData(value: unknown): value is PlannerData {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  if (
    !data.checks ||
    typeof data.checks !== "object" ||
    Array.isArray(data.checks)
  )
    return false;
  if (
    !data.notes ||
    typeof data.notes !== "object" ||
    Array.isArray(data.notes)
  )
    return false;
  return (
    Object.values(data.checks).every(
      (items) =>
        Array.isArray(items) && items.every((item) => typeof item === "string"),
    ) && Object.values(data.notes).every((note) => typeof note === "string")
  );
}
