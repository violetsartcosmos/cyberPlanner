import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import type { PlannerActionResult, PlannerPage } from "../../../../shared/planner/types";
import { routinePoints, type RoutineKind } from "../../../../shared/planner/routines";

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

export async function plannerAction({ request }: ActionFunctionArgs) {
  try {
    const form = await request.formData();
    const intent = form.get("intent");
    const completed = form.get("completed");
    if ((intent === "toggle_builtin" || intent === "toggle_physical_therapy" || intent === "toggle_external") &&
        completed !== "true" && completed !== "false") {
      return { ok: false, error: "That task state is invalid." } satisfies PlannerActionResult;
    }
    let path = "/api/planner";
    let method = "POST";
    let input: object | undefined;
    let message: string | undefined;
    const date = encodeURIComponent(form.get("date") as string);
    switch (intent) {
      case "save_journal":
        path = `/api/journals/${date}`;
        method = "PUT";
        input = { content: form.get("journal") };
        message = "Journal saved.";
        break;
      case "toggle_builtin":
        path = `/api/routines/${encodeURIComponent(form.get("taskId") as string)}/completions/${date}`;
        method = "PUT";
        input = { completed: completed === "true" };
        break;
      case "toggle_physical_therapy":
        path = `/api/therapy/sessions/${encodeURIComponent(form.get("sessionId") as string)}/exercises/${encodeURIComponent(form.get("exerciseId") as string)}/completions/${date}`;
        method = "PUT";
        input = { completed: completed === "true" };
        break;
      case "toggle_external":
        path = `/api/external-tasks/${encodeURIComponent(form.get("source") as string)}/${encodeURIComponent(form.get("externalId") as string)}/completion`;
        method = "PUT";
        input = { date: form.get("date"), completed: completed === "true" };
        break;
      case "update_routine_kind": {
        const kind = form.get("kind") as RoutineKind;
        path = `/api/routines/${encodeURIComponent(form.get("taskId") as string)}`;
        method = "PATCH";
        input = { kind };
        message = `Moved to ${kind} (${routinePoints[kind]} pts).`;
        break;
      }
    }
    const response = await fetch(path, {
      method,
      ...(input ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) } : { body: form }),
      signal: request.signal,
    });
    if (path === "/api/planner") {
      if (!response.ok) return { ok: false, error: `Could not submit the planner action (${response.status}).` } satisfies PlannerActionResult;
      return await response.json() as PlannerActionResult;
    }
    if (!response.ok && !response.headers.get("Content-Type")?.includes("application/json")) {
      return { ok: false, error: `Could not submit the planner action (${response.status}).` } satisfies PlannerActionResult;
    }
    const result = await response.json() as { error?: string; earnedAchievements?: string[] };
    if (!response.ok) {
      return { ok: false, error: result.error ?? `Could not submit the planner action (${response.status}).` } satisfies PlannerActionResult;
    }
    return {
      ok: true,
      ...(message ? { message } : {}),
      ...(result.earnedAchievements ? { earnedAchievements: result.earnedAchievements } : {}),
    } satisfies PlannerActionResult;
  } catch (error) {
    if (request.signal.aborted) throw error;
    return { ok: false, error: error instanceof Error ? error.message : "Could not submit the planner action." } satisfies PlannerActionResult;
  }
}
