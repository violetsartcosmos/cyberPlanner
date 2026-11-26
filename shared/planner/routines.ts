export const routineLists = ["morning", "night", "daily"] as const;
export const routineKinds = ["side", "main", "boss"] as const;
export const routineWeekdays = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
] as const;

export type RoutineList = (typeof routineLists)[number];
export type RoutineKind = (typeof routineKinds)[number];
export type RoutineWeekday = (typeof routineWeekdays)[number];

export type RoutineTask = {
  id: number;
  list: RoutineList;
  weekday: RoutineWeekday | null;
  title: string;
  kind: RoutineKind;
  points: number;
};

export type RoutineGroup = {
  id: number;
  weekday: RoutineWeekday;
  title: string;
  message: string;
};

export const routinePoints: Record<RoutineKind, number> = {
  side: 10,
  main: 50,
  boss: 150,
};

export function routineWeekday(index: number): RoutineWeekday {
  const weekday = routineWeekdays[index];
  if (!weekday) throw new Error("Invalid weekday index.");
  return weekday;
}

export function routinesFor(routines: RoutineTask[], list: RoutineList, weekday: RoutineWeekday | null) {
  return routines
    .filter((routine) => routine.list === list && routine.weekday === weekday)
    .sort((a, b) => a.id - b.id);
}

export function routineGroupFor(groups: RoutineGroup[], weekday: RoutineWeekday) {
  return groups.find((group) => group.weekday === weekday);
}
