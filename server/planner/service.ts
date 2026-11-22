import { databaseDate, dateString, getDatabase, serializableTransaction } from "../db/client";
import { awardTaskPoints } from "../points/service";
import type { ExternalTask } from "../../shared/planner/types";
import { dateKey } from "../../shared/planner/utils";
import { refreshStreakAchievements } from "../gamification/service";

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

export async function getPlannerSnapshot(date: string) {
  const db = getDatabase();
  const [days, externalTasks] = await Promise.all([
    db.plannerDay.findMany({ select: { day: true, checks: true, journal: true } }),
    db.externalTask.findMany({
      where: {
        isDeleted: false,
        OR: [{ dueDate: databaseDate(date) }, { dueDate: null }],
      },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { title: "asc" }],
    }),
  ]);
  return {
    checks: Object.fromEntries(
      days.map((day) => [dateString(day.day), taskChecks(day.checks)]),
    ),
    journalDates: days.filter((day) => day.journal.trim()).map((day) => dateString(day.day)),
    tasks: externalTasks.map(externalTask),
  };
}

export async function getPlannerNote(date: string) {
  const day = await getDatabase().plannerDay.findUnique({
    where: { day: databaseDate(date) },
    select: { note: true },
  });
  return day?.note ?? "";
}

export async function savePlannerNote(date: string, note: string) {
  const day = databaseDate(date);
  await getDatabase().plannerDay.upsert({
    where: { day },
    create: { day, note },
    update: { note },
  });
}

export async function getPlannerJournal(date: string) {
  const day = await getDatabase().plannerDay.findUnique({
    where: { day: databaseDate(date) },
    select: { journal: true },
  });
  return day?.journal ?? "";
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
      await awardTaskPoints(client, `builtin:${date}:${taskId}`, date);
    }
    const unlockedAchievements = await refreshStreakAchievements(client, dateKey(new Date()));
    return { checks, unlockedAchievements };
  });
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

export async function upsertGoogleTask(task: ExternalTask, date: string) {
  await getDatabase().$transaction(async (client) => {
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
    if (task.completed && !task.isDeleted) {
      await awardTaskPoints(
        client,
        `external:google:${task.externalId}`,
        task.completedAt?.slice(0, 10) ?? date,
      );
    }
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
