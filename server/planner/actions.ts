import { isValidDateKey } from "../../shared/planner/utils";
import { routineKinds, routinePoints } from "../../shared/planner/routines";
import {
  getExternalTask,
  savePlannerJournal,
  setBuiltinTaskCompletion,
  setExternalTaskCompletion,
  updateRoutineKind,
  type ExternalTaskSource,
} from "./service";
import { routineId } from "./routines";
import { setGoogleTaskCompleted } from "../google/service";
import type { ActionHandler } from "./dispatch";
import { setTherapyCompletion } from "./therapy";

// Shared by the planner form and the resource API. Google tasks are updated
// remotely first; Gmail follow-ups only need the local update. The local
// service records the completion and any award together. False means not found.
export async function updateExternalCompletion(source: ExternalTaskSource, externalId: string, completed: boolean, date: string) {
  const task = await getExternalTask(source, externalId);
  if (!task) return false;
  if (source === "google") {
    if (!task.taskListId) throw new Error("The Google Task is missing its task-list ID.");
    await setGoogleTaskCompleted(task.taskListId, externalId, completed);
  }
  await setExternalTaskCompletion(task, completed, date);
  return true;
}

export const plannerFormActions = {
  async toggle_physical_therapy(form) {
    const date = form.get("date") as string;
    const sessionId = form.get("sessionId") as string;
    const exerciseId = form.get("exerciseId") as string;
    const completed = form.get("completed");
    if (!isValidDateKey(date) ||
        (completed !== "true" && completed !== "false")) {
      return { ok: false, error: "That physical therapy exercise or state is invalid." };
    }
    const { earnedAchievements } = await setTherapyCompletion(date, sessionId, exerciseId, completed === "true");
    return { ok: true, earnedAchievements };
  },

  async toggle_builtin(form) {
    const date = form.get("date") as string;
    const taskId = form.get("taskId") as string;
    if (!isValidDateKey(date)) {
      return { ok: false, error: "That planner task is invalid." };
    }
    const completed = form.get("completed");
    if (completed !== "true" && completed !== "false") {
      return { ok: false, error: "That task state is invalid." };
    }
    const { earnedAchievements } = await setBuiltinTaskCompletion(date, taskId, completed === "true");
    return { ok: true, earnedAchievements };
  },

  async update_routine_kind(form) {
    const id = routineId(form.get("taskId") as string);
    const kind = routineKinds.find((item) => item === form.get("kind"));
    if (id === null) return { ok: false, error: "That routine is invalid." };
    if (!kind) {
      return { ok: false, error: "That routine type is invalid." };
    }
    const updated = await updateRoutineKind(id, kind);
    if (!updated) return { ok: false, error: "That routine no longer exists." };
    return { ok: true, message: `Moved to ${kind} (${routinePoints[kind]} pts).` };
  },

  async toggle_external(form) {
    const date = form.get("date") as string;
    const source = form.get("source");
    const externalId = form.get("externalId") as string;
    const completed = form.get("completed");
    if (!isValidDateKey(date) ||
        (source !== "google" && source !== "gmail") ||
        !externalId ||
        (completed !== "true" && completed !== "false")) {
      return { ok: false, error: "That synced task is invalid." };
    }
    if (!(await updateExternalCompletion(source, externalId, completed === "true", date))) {
      return { ok: false, error: "That synced task no longer exists." };
    }
    return { ok: true };
  },

  async save_journal(form) {
    const date = form.get("date") as string;
    const journal = form.get("journal") as string;
    if (!isValidDateKey(date)) return { ok: false, error: "That planner date is invalid." };
    await savePlannerJournal(date, journal);
    return { ok: true, message: "Journal saved." };
  },
} satisfies Record<string, ActionHandler>;
