export const routineLists = ["morning", "night", "daily"] as const;
export const routineKinds = ["side", "main", "boss"] as const;

export type RoutineList = (typeof routineLists)[number];
export type RoutineKind = (typeof routineKinds)[number];

export type RoutineTask = {
  list: RoutineList;
  weekday: number;
  slot: number;
  title: string;
  kind: RoutineKind;
  points: number;
};

export type RoutineGroup = {
  weekday: number;
  title: string;
  message: string;
};

export const routinePoints: Record<RoutineKind, number> = {
  side: 10,
  main: 50,
  boss: 150,
};

export function routineCheckId(list: RoutineList, slot: number) {
  return `${list}-${slot}`;
}

export function routinesFor(routines: RoutineTask[], list: RoutineList, weekday: number) {
  return routines
    .filter((routine) => routine.list === list && routine.weekday === weekday)
    .sort((a, b) => a.slot - b.slot);
}

export function routineGroupFor(groups: RoutineGroup[], weekday: number) {
  return groups.find((group) => group.weekday === weekday);
}
