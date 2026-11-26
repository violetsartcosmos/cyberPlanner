import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import type { PlannerActionResult, PlannerPage } from "../../../../shared/planner/types";
import { routinePoints, type RoutineKind } from "../../../../shared/planner/routines";

/**
 * Loads the combined planner page for the selected date.
 * @param args - The React Router loader arguments.
 * @returns The planner page used by the layout and its child pages.
 */
export async function plannerLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  url.searchParams.set("taskKeys", "visible");
  const response = await fetch(`/api/planner${url.search}`, { signal: request.signal });
  if (!response.ok) throw new Error(`Could not load the planner (${response.status}).`);
  const page = await response.json() as PlannerPage;
  if (page.authenticated && (
    typeof page.journal !== "string" || !Array.isArray(page.journalDates) ||
    !Array.isArray(page.achievements) || !Array.isArray(page.quests) ||
    !Array.isArray(page.routines) || !Array.isArray(page.routineGroups) ||
    !Array.isArray(page.questTemplates) || !Array.isArray(page.acceptedTemplateIds) ||
    !Array.isArray(page.newlyEarned) || typeof page.totalXp !== "number" ||
    !page.therapy || !Array.isArray(page.therapy.therapySessions) || typeof page.therapy.earnedPoints !== "number"
  )) {
    throw new Error("The planner server is out of date. Apply database migrations and restart the server.");
  }
  return page;
}

/**
 * Sends existing planner forms to their resource or legacy endpoints.
 * @param args - The React Router action arguments.
 * @returns The submitted operation's notification, awards, or API error.
 */
export async function plannerAction({ request }: ActionFunctionArgs): Promise<PlannerActionResult> {
  const form = await request.formData();
  const intent = form.get("intent");
  const completed = form.get("completed");
  if ((intent === "toggle_builtin" || intent === "toggle_physical_therapy" || intent === "toggle_external") &&
      completed !== "true" && completed !== "false") {
    return { ok: false, error: "That task state is invalid." };
  }
  switch (intent) {
    case "save_journal": {
      const response = await fetch(`/api/journals/${encodeURIComponent(form.get("date") as string)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: form.get("journal") }),
        signal: request.signal,
      });
      if (!response.ok) {
        return { ok: false, error: (await response.json() as { error: string }).error };
      }
      return { ok: true, message: "Journal saved." };
    }
    case "toggle_builtin": {
      const response = await fetch(`/api/routines/${encodeURIComponent(form.get("taskId") as string)}/completions/${encodeURIComponent(form.get("date") as string)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: completed === "true" }),
        signal: request.signal,
      });
      if (!response.ok) {
        return { ok: false, error: (await response.json() as { error: string }).error };
      }
      const { earnedAchievements } = await response.json() as { earnedAchievements: string[] };
      return { ok: true, earnedAchievements };
    }
    case "toggle_physical_therapy": {
      const response = await fetch(`/api/therapy/sessions/${encodeURIComponent(form.get("sessionId") as string)}/exercises/${encodeURIComponent(form.get("exerciseId") as string)}/completions/${encodeURIComponent(form.get("date") as string)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: completed === "true" }),
        signal: request.signal,
      });
      if (!response.ok) {
        return { ok: false, error: (await response.json() as { error: string }).error };
      }
      const { earnedAchievements } = await response.json() as { earnedAchievements: string[] };
      return { ok: true, earnedAchievements };
    }
    case "toggle_external": {
      const response = await fetch(`/api/external-tasks/${encodeURIComponent(form.get("source") as string)}/${encodeURIComponent(form.get("externalId") as string)}/completion`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: form.get("date"), completed: completed === "true" }),
        signal: request.signal,
      });
      if (!response.ok) {
        return { ok: false, error: (await response.json() as { error: string }).error };
      }
      return { ok: true };
    }
    case "update_routine_kind": {
      const kind = form.get("kind") as RoutineKind;
      const response = await fetch(`/api/routines/${encodeURIComponent(form.get("taskId") as string)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
        signal: request.signal,
      });
      if (!response.ok) {
        return { ok: false, error: (await response.json() as { error: string }).error };
      }
      return { ok: true, message: `Moved to ${kind} (${routinePoints[kind]} pts).` };
    }
    default: {
      const response = await fetch("/api/planner", {
        method: "POST",
        body: form,
        signal: request.signal,
      });
      if (!response.ok) {
        return { ok: false, error: `Could not submit the planner action (${response.status}).` };
      }
      return await response.json() as PlannerActionResult;
    }
  }
}
