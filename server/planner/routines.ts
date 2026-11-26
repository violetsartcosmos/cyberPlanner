import type { Prisma } from "../generated/prisma/client";
import {
  routineKinds,
  routineLists,
  routineWeekday,
  routineWeekdays,
  type RoutineGroup,
  type RoutineKind,
  type RoutineList,
  type RoutineTask,
  type RoutineWeekday,
} from "../../shared/planner/routines";
import { parseDate, weekdayIndex } from "../../shared/planner/utils";

type RoutineClient = Pick<Prisma.TransactionClient, "routineTask" | "routineGroup">;

const routineIdPattern = /^[1-9]\d*$/;

function routineList(value: string): RoutineList {
  if (!routineLists.some((list) => list === value)) throw new Error("Stored routine list is invalid.");
  return value as RoutineList;
}

function routineKind(value: string): RoutineKind {
  if (!routineKinds.some((kind) => kind === value)) throw new Error("Stored routine kind is invalid.");
  return value as RoutineKind;
}

function storedWeekday(value: string): RoutineWeekday {
  if (!routineWeekdays.some((weekday) => weekday === value)) {
    throw new Error("Stored routine weekday is invalid.");
  }
  return value as RoutineWeekday;
}

export async function loadRoutines(client: RoutineClient) {
  const [rows, groups] = await Promise.all([
    client.routineTask.findMany({
      include: { groups: { include: { group: true } } },
      orderBy: [{ list: "asc" }, { id: "asc" }],
    }),
    client.routineGroup.findMany({ orderBy: { weekday: "asc" } }),
  ]);
  const routines: RoutineTask[] = rows.map((row) => ({
    id: row.id,
    list: routineList(row.list),
    weekday: !("groups" in row) || row.groups.length === 0
      ? null
      : storedWeekday(row.groups[0].group.weekday),
    title: row.title,
    kind: routineKind(row.kind),
    points: row.points,
  }));
  routines.sort((a, b) => a.list.localeCompare(b.list)
    || (a.weekday === null ? -1 : routineWeekdays.indexOf(a.weekday))
      - (b.weekday === null ? -1 : routineWeekdays.indexOf(b.weekday))
    || a.id - b.id);
  const routineGroups: RoutineGroup[] = groups.map((group) => ({
    id: group.id,
    weekday: storedWeekday(group.weekday),
    title: group.title,
    message: group.message,
  }));
  routineGroups.sort((a, b) => routineWeekdays.indexOf(a.weekday) - routineWeekdays.indexOf(b.weekday));
  return { routines, routineGroups };
}

export function routineId(taskId: string) {
  const id = Number(taskId);
  return routineIdPattern.test(taskId) && Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

export async function findRoutine(client: RoutineClient, date: string, taskId: string) {
  const id = routineId(taskId);
  if (id === null) return null;
  return client.routineTask.findFirst({
    where: {
      id,
      OR: [
        { groups: { none: {} } },
        { groups: { some: { group: { weekday: routineWeekday(weekdayIndex(parseDate(date))) } } } },
      ],
    },
  });
}
