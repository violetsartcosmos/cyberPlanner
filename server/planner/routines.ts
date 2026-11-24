import type { Prisma } from "../generated/prisma/client";
import {
  routineKinds,
  routineLists,
  type RoutineGroup,
  type RoutineKind,
  type RoutineList,
  type RoutineTask,
} from "../../shared/planner/routines";
import { parseDate, weekdayIndex } from "../../shared/planner/utils";

type RoutineClient = Pick<Prisma.TransactionClient, "routineTask" | "routineGroup">;

const routineIdPattern = /^(morning|night|daily)-(0|[1-9]\d*)$/;

function routineList(value: string): RoutineList {
  if (!routineLists.some((list) => list === value)) throw new Error("Stored routine list is invalid.");
  return value as RoutineList;
}

function routineKind(value: string): RoutineKind {
  if (!routineKinds.some((kind) => kind === value)) throw new Error("Stored routine kind is invalid.");
  return value as RoutineKind;
}

export async function loadRoutines(client: RoutineClient) {
  const [rows, groups] = await Promise.all([
    client.routineTask.findMany({ orderBy: [{ list: "asc" }, { weekday: "asc" }, { slot: "asc" }] }),
    client.routineGroup.findMany({ orderBy: { weekday: "asc" } }),
  ]);
  const routines: RoutineTask[] = rows.map((row) => ({
    list: routineList(row.list),
    weekday: row.weekday,
    slot: row.slot,
    title: row.title,
    kind: routineKind(row.kind),
    points: row.points,
  }));
  const routineGroups: RoutineGroup[] = groups.map((group) => ({
    weekday: group.weekday,
    title: group.title,
    message: group.message,
  }));
  return { routines, routineGroups };
}

// Morning and night routines use weekday -1; the daily list is keyed by weekday.
export function routineKeyFor(date: string, taskId: string) {
  const match = routineIdPattern.exec(taskId);
  if (!match) return null;
  const list = routineList(match[1]);
  const slot = Number(match[2]);
  const weekday = list === "daily" ? weekdayIndex(parseDate(date)) : -1;
  return { list, weekday, slot };
}

export async function findRoutine(client: RoutineClient, date: string, taskId: string) {
  const key = routineKeyFor(date, taskId);
  if (!key) return null;
  return client.routineTask.findUnique({
    where: { list_weekday_slot: key },
  });
}
