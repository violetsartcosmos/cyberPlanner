import { dailyQuests, morningRoutine, nightRoutine } from "../../shared/planner/definitions";
import { isValidDateKey, parseDate, weekdayIndex } from "../../shared/planner/utils";
import {
  getExternalTask,
  savePlannerJournal,
  savePlannerNote,
  setBuiltinTaskCompletion,
  setExternalTaskCompletion,
} from "./service";
import { setGoogleTaskCompleted } from "../google/service";
import type { ActionHandler } from "./dispatch";

function isBuiltinTask(date: string, taskId: string) {
  const [prefix, indexText, extra] = taskId.split("-");
  if (extra !== undefined || indexText === undefined || !/^\d+$/.test(indexText)) return false;
  const index = Number(indexText);
  const items =
    prefix === "daily"
      ? dailyQuests[weekdayIndex(parseDate(date))].tasks
      : prefix === "morning"
        ? morningRoutine
        : prefix === "night"
          ? nightRoutine
          : null;
  return items !== null && items !== undefined && index < items.length;
}

export const plannerFormActions = {
  async toggle_builtin(form) {
    const date = form.get("date");
    const taskId = form.get("taskId");
    if (typeof date !== "string" || !isValidDateKey(date) ||
        typeof taskId !== "string" || !isBuiltinTask(date, taskId)) {
      return { ok: false, error: "That planner task is invalid." };
    }
    const completed = form.get("completed");
    if (completed !== "true" && completed !== "false") {
      return { ok: false, error: "That task state is invalid." };
    }
    await setBuiltinTaskCompletion(date, taskId, completed === "true");
    return { ok: true };
  },

  async toggle_external(form) {
    const date = form.get("date");
    const source = form.get("source");
    const externalId = form.get("externalId");
    const completed = form.get("completed");
    if (typeof date !== "string" || !isValidDateKey(date) ||
        (source !== "google" && source !== "gmail") ||
        typeof externalId !== "string" || !externalId ||
        (completed !== "true" && completed !== "false")) {
      return { ok: false, error: "That synced task is invalid." };
    }
    const task = await getExternalTask(source, externalId);
    if (!task) return { ok: false, error: "That synced task no longer exists." };
    const isCompleted = completed === "true";
    if (source === "google") {
      if (!task.taskListId) throw new Error("The Google Task is missing its task-list ID.");
      await setGoogleTaskCompleted(task.taskListId, externalId, isCompleted);
    }
    await setExternalTaskCompletion(task, isCompleted, date);
    return { ok: true };
  },

  async save_note(form) {
    const date = form.get("date");
    const note = form.get("note");
    if (typeof date !== "string" || !isValidDateKey(date)) return { ok: false, error: "That planner date is invalid." };
    if (typeof note !== "string") return { ok: false, error: "That note is invalid." };
    if (note.length > 10_000) return { ok: false, error: "Notes must be under 10,000 characters." };
    await savePlannerNote(date, note);
    return { ok: true, message: "Note saved." };
  },
  async save_journal(form) {
    const date = form.get("date");
    const journal = form.get("journal");
    if (typeof date !== "string" || !isValidDateKey(date)) return { ok: false, error: "That planner date is invalid." };
    if (typeof journal !== "string") return { ok: false, error: "That journal entry is invalid." };
    if (journal.length > 10_000) return { ok: false, error: "Journal entries must be under 10,000 characters." };
    await savePlannerJournal(date, journal);
    return { ok: true, message: "Journal saved." };
  },
} satisfies Record<string, ActionHandler>;
