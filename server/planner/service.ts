import { databaseDate, dateString, getDatabase, serializableTransaction } from "../db/client";
import { awardTaskPoints } from "../points/service";
import type { ExternalTask } from "../../shared/planner/types";
import { dateKey } from "../../shared/planner/utils";
import { routinePoints, type RoutineKind, type RoutineList } from "../../shared/planner/routines";
import { refreshAchievements } from "../gamification/service";
import { findRoutine } from "./routines";
import type { Prisma } from "../generated/prisma/client";

export type { ExternalTask } from "../../shared/planner/types";
export type ExternalTaskSource = ExternalTask["source"];

type StoredExternalTask = {
  source: string;
  externalId: string;
  taskListId: string | null;
  title: string;
  dueDate: Date | null;
  completed: boolean;
  emailFrom: string | null;
  emailUrl: string | null;
};

function externalTask(row: StoredExternalTask): ExternalTask {
  if (row.source !== "google" && row.source !== "gmail") {
    throw new Error("Stored task has an invalid source.");
  }
  return {
    source: row.source,
    externalId: row.externalId,
    taskListId: row.taskListId,
    title: row.title,
    dueDate: row.dueDate ? dateString(row.dueDate) : null,
    completed: row.completed,
    emailFrom: row.emailFrom,
    emailUrl: row.emailUrl,
  };
}

function taskChecks(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error("Stored planner checks are invalid.");
  }
  return value;
}

type PlannerDaySnapshot = { day: Date; checks: Prisma.JsonValue; journal: string };

export async function getPlannerTasks(date: string) {
  const rows = await getDatabase().externalTask.findMany({
      where: {
        isDeleted: false,
        OR: [{ dueDate: databaseDate(date) }, { dueDate: null }],
      },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { title: "asc" }],
  });
  return rows.map(externalTask);
}

export async function getPlannerSnapshot(date: string, plannerDays?: PlannerDaySnapshot[], plannerTasks?: ExternalTask[]) {
  const [days, tasks] = await Promise.all([
    plannerDays ?? getDatabase().plannerDay.findMany({ select: { day: true, checks: true, journal: true } }),
    plannerTasks ?? getPlannerTasks(date),
  ]);
  return {
    checks: Object.fromEntries(
      days.map((day) => [dateString(day.day), taskChecks(day.checks)]),
    ),
    journalDates: days.filter((day) => day.journal.trim()).map((day) => dateString(day.day)),
    journal: days.find((day) => dateString(day.day) === date)?.journal ?? "",
    tasks,
  };
}

export async function savePlannerJournal(date: string, journal: string) {
  const day = databaseDate(date);
  await getDatabase().plannerDay.upsert({
    where: { day },
    create: { day, journal },
    update: { journal },
  });
}

export async function setBuiltinTaskCompletion(
  date: string,
  taskId: string,
  completed: boolean,
) {
  const day = databaseDate(date);
  return serializableTransaction(async (client) => {
    const routine = await findRoutine(client, date, taskId);
    if (!routine) throw new Error("That planner task is invalid.");
    const existing = await client.plannerDay.findUnique({ where: { day } });
    const next = new Set(taskChecks(existing?.checks ?? []));
    if (completed) next.add(taskId);
    else next.delete(taskId);
    const checks = [...next];
    await client.plannerDay.upsert({
      where: { day },
      create: { day, checks },
      update: { checks },
    });
    if (completed) {
      await awardTaskPoints(client, `builtin:${date}:${taskId}`, date, routine.points);
    }
    const earnedAchievements = await refreshAchievements(client, dateKey(new Date()));
    return { checks, earnedAchievements };
  });
}

export async function updateRoutineKind(
  slot: { list: RoutineList; weekday: number; slot: number },
  kind: RoutineKind,
) {
  const result = await getDatabase().routineTask.updateMany({
    where: slot,
    data: { kind, points: routinePoints[kind] },
  });
  return result.count === 1;
}

export async function getExternalTask(
  source: ExternalTaskSource,
  externalId: string,
) {
  const row = await getDatabase().externalTask.findFirst({
    where: { source, externalId, isDeleted: false },
  });
  return row ? externalTask(row) : null;
}

export async function setExternalTaskCompletion(
  task: ExternalTask,
  completed: boolean,
  date: string,
) {
  return getDatabase().$transaction(async (client) => {
    const result = await client.externalTask.updateMany({
      where: { source: task.source, externalId: task.externalId, isDeleted: false },
      data: { completed, completedAt: completed ? new Date() : null, updatedAt: new Date() },
    });
    if (result.count !== 1) {
      throw new Error("That synced task no longer exists.");
    }
    if (completed) {
      await awardTaskPoints(client, `external:${task.source}:${task.externalId}`, date);
    }
  });
}

export async function upsertGoogleTasks(tasks: ExternalTask[], date: string) {
  if (!tasks.length) return;
  await getDatabase().$transaction(async (client) => {
    for (const task of tasks) {
      const fields = {
        taskListId: task.taskListId,
        title: task.title,
        dueDate: task.dueDate ? databaseDate(task.dueDate) : null,
        completed: task.completed,
        completedAt: task.completedAt ? new Date(task.completedAt) : null,
        isDeleted: task.isDeleted ?? false,
      };
      await client.externalTask.upsert({
        where: { source_externalId: { source: "google", externalId: task.externalId } },
        create: { source: "google", externalId: task.externalId, ...fields },
        update: { ...fields, updatedAt: new Date() },
      });
    }
    const awards = tasks.filter((task) => task.completed && !task.isDeleted).map((task) => ({
      amount: 10,
      entryType: "earn",
      taskKey: `external:google:${task.externalId}`,
      taskDate: databaseDate(task.completedAt?.slice(0, 10) ?? date),
    }));
    if (awards.length) await client.pointLedger.createMany({ data: awards, skipDuplicates: true });
  });
}

export async function createGmailTask(task: ExternalTask) {
  const result = await getDatabase().externalTask.createMany({
    data: [{
      source: "gmail",
      externalId: task.externalId,
      title: task.title,
      dueDate: task.dueDate ? databaseDate(task.dueDate) : null,
      emailFrom: task.emailFrom,
      emailUrl: task.emailUrl,
    }],
    skipDuplicates: true,
  });
  return result.count === 1;
}

export async function getGoogleConnection() {
  const connection = await getDatabase().googleConnection.findUnique({
    where: { singleton: true },
  });
  return connection
    ? { email: connection.email, encrypted_refresh_token: connection.encryptedRefreshToken }
    : null;
}

export async function saveGoogleConnection(email: string, encryptedRefreshToken: string) {
  await getDatabase().googleConnection.upsert({
    where: { singleton: true },
    create: { singleton: true, email, encryptedRefreshToken },
    update: { email, encryptedRefreshToken, updatedAt: new Date() },
  });
}
