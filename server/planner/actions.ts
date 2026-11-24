import { isValidDateKey } from "../../shared/planner/utils";
import { routineKinds, routinePoints, type RoutineKind, type RoutineList } from "../../shared/planner/routines";
import {
  getExternalTask,
  savePlannerJournal,
  setBuiltinTaskCompletion,
  setExternalTaskCompletion,
  updateRoutineKind,
} from "./service";
import { findRoutine } from "./routines";
import { setGoogleTaskCompleted } from "../google/service";
import { getDatabase } from "../db/client";
import type { ActionHandler } from "./dispatch";

async function isBuiltinTask(date: string, taskId: string) {
  return (await findRoutine(getDatabase(), date, taskId)) !== null;
}

function routineSlot(form: FormData) {
  const list = form.get("list");
  const weekdayText = form.get("weekday");
  const slotText = form.get("slot");
  const weekday = Number(weekdayText);
  const slot = Number(slotText);
  const validList = list === "morning" || list === "night" || list === "daily";
  const validWeekday = validList && (list === "daily"
    ? Number.isInteger(weekday) && weekday >= 0 && weekday <= 6
    : weekday === -1);
  if (!validList || !validWeekday || !/^\d+$/.test(String(slotText)) || !Number.isInteger(slot)) return null;
  return { list: list as RoutineList, weekday, slot };
}

export const plannerFormActions = {
  async toggle_builtin(form) {
    const date = form.get("date");
    const taskId = form.get("taskId");
    if (typeof date !== "string" || !isValidDateKey(date) ||
        typeof taskId !== "string" || !(await isBuiltinTask(date, taskId))) {
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
    const slot = routineSlot(form);
    const kind = form.get("kind");
    if (!slot) return { ok: false, error: "That routine is invalid." };
    if (typeof kind !== "string" || !routineKinds.some((item) => item === kind)) {
      return { ok: false, error: "That routine type is invalid." };
    }
    const updated = await updateRoutineKind(slot, kind as RoutineKind);
    if (!updated) return { ok: false, error: "That routine no longer exists." };
    return { ok: true, message: `Moved to ${kind} (${routinePoints[kind as RoutineKind]} pts).` };
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

  async save_journal(form) {
    const date = form.get("date");
    const journal = form.get("journal");
    if (typeof date !== "string" || !isValidDateKey(date)) return { ok: false, error: "That planner date is invalid." };
    if (typeof journal !== "string") return { ok: false, error: "That journal entry is invalid." };
    if (journal.length > 1_000_000) return { ok: false, error: "Journal entries must be under 1,000,000 characters." };
    await savePlannerJournal(date, journal);
    return { ok: true, message: "Journal saved." };
  },
} satisfies Record<string, ActionHandler>;
