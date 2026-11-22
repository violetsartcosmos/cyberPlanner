import { addDays, dateKey, dayProgress, parseDate } from "./utils";

export function streaks(dates: string[], today: string) {
  const sorted = [...new Set(dates.filter((date) => date <= today))].sort();
  let best = 0;
  let run = 0;
  let previous = "";
  for (const date of sorted) {
    run = previous && dateKey(addDays(parseDate(previous), 1)) === date ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  const yesterday = dateKey(addDays(parseDate(today), -1));
  return { current: previous === today || previous === yesterday ? run : 0, best };
}

export function getProfileStats(checks: Record<string, string[]>, today: string) {
  const days = Object.entries(checks).filter(([date]) => date <= today);
  const completedTasks = days.reduce(
    (total, [date, checked]) => total + dayProgress(parseDate(date), checked).completed,
    0,
  );
  const activeDates = days
    .filter(([date, checked]) => dayProgress(parseDate(date), checked).completed > 0)
    .map(([date]) => date);
  const activityStreak = streaks(activeDates, today);
  return {
    completedTasks,
    activeDays: activeDates.length,
    activityStreak: activityStreak.current,
  };
}

export function levelProgress(totalXp: number) {
  const level = Math.floor(totalXp / 100) + 1;
  return { level, current: totalXp % 100, target: 100 };
}
