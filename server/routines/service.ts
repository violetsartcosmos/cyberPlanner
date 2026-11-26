import { databaseDate, getDatabase, serializableTransaction } from "../db/client";
import { awardTaskPoints } from "../points/service";
import { dateKey } from "../../shared/planner/utils";
import { routinePoints, type RoutineKind } from "../../shared/planner/routines";
import { refreshAchievements } from "../gamification/service";
import { findRoutine } from "./definitions";

export async function listRoutineCompletions() {
  return getDatabase().routineTaskCompletion.findMany({ orderBy: [{ day: "asc" }, { taskId: "asc" }] });
}

export async function getRoutineCompletions(date: string) {
  const checks = await getDatabase().routineTaskCompletion.findMany({
    where: { day: databaseDate(date) }, orderBy: { taskId: "asc" }, select: { taskId: true },
  });
  return checks.map((check) => String(check.taskId));
}

export async function setRoutineCompletion(date: string, taskId: string, completed: boolean) {
  const day = databaseDate(date);
  return serializableTransaction(async (client) => {
    const routine = await findRoutine(client, date, taskId);
    if (!routine) throw new Error("That planner task is invalid.");
    if (completed) {
      await client.routineTaskCompletion.upsert({
        where: { day_taskId: { day, taskId: routine.id } },
        create: { day, taskId: routine.id },
        update: {},
      });
    } else {
      await client.routineTaskCompletion.deleteMany({ where: { day, taskId: routine.id } });
    }
    const checks = (await client.routineTaskCompletion.findMany({
      where: { day }, orderBy: { taskId: "asc" }, select: { taskId: true },
    })).map((check) => String(check.taskId));
    if (completed) {
      await awardTaskPoints(client, `builtin:${date}:${taskId}`, date, routine.points);
    }
    const earnedAchievements = await refreshAchievements(client, dateKey(new Date()));
    return { checks, earnedAchievements };
  });
}

export async function updateRoutineKind(id: number, kind: RoutineKind) {
  const result = await getDatabase().routineTask.updateMany({
    where: { id },
    data: { kind, points: routinePoints[kind] },
  });
  return result.count === 1;
}
