import { databaseDate, dateString, getDatabase } from "../db/client";
import { awardTaskPoints } from "../points/service";
import type { ExternalTask } from "../../shared/planner/types";

export type { ExternalTask } from "../../shared/planner/types";

/** Identifies whether a planner task came from Google Tasks or Gmail. */
export type ExternalTaskSource = ExternalTask["source"];

/** Describes the saved task fields used to build planner task data. */
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

/**
 * Prepares a saved Google or Gmail task for display in the planner.
 * @param row - Saved task details from the database.
 * @returns Planner task details with the due date formatted as YYYY-MM-DD.
 */
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

/**
 * Loads Google and Gmail tasks for the selected date, including tasks with no due date.
 * @param date - Selected planner date in YYYY-MM-DD format.
 * @returns Tasks for display, with dated tasks first and titles sorted alphabetically.
 */
export async function getExternalTasks(date: string) {
  const rows = await getDatabase().externalTask.findMany({
    where: { isDeleted: false, OR: [{ dueDate: databaseDate(date) }, { dueDate: null }] },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { title: "asc" }],
  });
  return rows.map(externalTask);
}

/**
 * Loads an individual Google or Gmail task.
 * @param source - The task's provider: google or gmail.
 * @param externalId - The task or email ID assigned by its provider.
 * @returns The saved task, or null when it is unavailable.
 */
export async function getExternalTask(source: ExternalTaskSource, externalId: string) {
  const row = await getDatabase().externalTask.findFirst({
    where: { source, externalId, isDeleted: false },
  });
  return row ? externalTask(row) : null;
}

/**
 * Saves whether a task is complete and awards points for its first completion.
 * @param task - The saved task to update.
 * @param completed - Whether the task should be checked.
 * @param date - Planner date for the point award, in YYYY-MM-DD format.
 * @returns A promise that resolves when the change is saved; no response data.
 */
export async function setExternalTaskCompletion(task: ExternalTask, completed: boolean, date: string) {
  return getDatabase().$transaction(async (client) => {
    const result = await client.externalTask.updateMany({
      where: { source: task.source, externalId: task.externalId, isDeleted: false },
      data: { completed, completedAt: completed ? new Date() : null, updatedAt: new Date() },
    });
    if (result.count !== 1) throw new Error("That synced task no longer exists.");
    if (completed) await awardTaskPoints(client, `external:${task.source}:${task.externalId}`, date);
  });
}

/**
 * Saves tasks imported from Google and awards points for completed tasks.
 * @param tasks - Task details received from Google synchronization.
 * @param date - Sync date in YYYY-MM-DD format, used when a completion date is absent.
 * @returns A promise that resolves when the tasks and awards are saved; no response data.
 */
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

/**
 * Adds a Gmail email to the planner as a follow-up task.
 * @param task - Email details and the selected due date.
 * @returns Whether a new follow-up task was created.
 */
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
