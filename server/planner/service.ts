import { databaseDate, dateString, getDatabase } from "../db/client";
import { awardTaskPoints } from "../points/service";
import type { ExternalTask } from "../../shared/planner/types";

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
