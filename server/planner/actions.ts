import { isValidDateKey } from "../../shared/planner/utils";
import { routineId } from "../routines/definitions";
import { setRoutineCompletion, updateRoutineKind } from "../routines/service";
import { saveJournal } from "../journals/service";
import { updateExternalCompletion } from "../google/service";
import type { ActionHandler } from "./dispatch";
import { setTherapyCompletion } from "../therapy/service";
import { routineKinds, routinePoints } from "../../shared/planner/routines";

export const plannerFormActions = {
  async toggle_physical_therapy(form) {
    const date = form.get("date") as string;
    const sessionId = form.get("sessionId") as string;
    const exerciseId = form.get("exerciseId") as string;
    const completed = form.get("completed");
    if (!isValidDateKey(date) || (completed !== "true" && completed !== "false")) {
      return { ok: false, error: "That physical therapy exercise or state is invalid." };
    }
    const { earnedAchievements } = await setTherapyCompletion(date, sessionId, exerciseId, completed === "true");
    return { ok: true, earnedAchievements };
  },
  async toggle_builtin(form) {
    const date = form.get("date") as string;
    const taskId = form.get("taskId") as string;
    if (!isValidDateKey(date)) return { ok: false, error: "That planner task is invalid." };
    const completed = form.get("completed");
    if (completed !== "true" && completed !== "false") return { ok: false, error: "That task state is invalid." };
    const { earnedAchievements } = await setRoutineCompletion(date, taskId, completed === "true");
    return { ok: true, earnedAchievements };
  },
  async update_routine_kind(form) {
    const id = routineId(form.get("taskId") as string);
    const kind = routineKinds.find((item) => item === form.get("kind"));
    if (id === null) return { ok: false, error: "That routine is invalid." };
    if (!kind) return { ok: false, error: "That routine type is invalid." };
    const updated = await updateRoutineKind(id, kind);
    if (!updated) return { ok: false, error: "That routine no longer exists." };
    return { ok: true, message: `Moved to ${kind} (${routinePoints[kind]} pts).` };
  },
  async toggle_external(form) {
    const date = form.get("date") as string;
    const source = form.get("source");
    const externalId = form.get("externalId") as string;
    const completed = form.get("completed");
    if (!isValidDateKey(date) || (source !== "google" && source !== "gmail") || !externalId ||
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
    await saveJournal(date, journal);
    return { ok: true, message: "Journal saved." };
  },
} satisfies Record<string, ActionHandler>;
