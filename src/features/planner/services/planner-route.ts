import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import type { PlannerActionResult, PlannerPage } from "../../../../shared/planner/types";

export async function plannerLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  url.searchParams.set("taskKeys", "visible");
  const response = await fetch(`/api/planner${url.search}`, { signal: request.signal });
  if (!response.ok) throw new Error(`Could not load the planner (${response.status}).`);
  const page = await response.json() as PlannerPage;
  if (page.authenticated && (
    typeof page.journal !== "string" || !Array.isArray(page.journalDates) ||
    !Array.isArray(page.achievements) || !Array.isArray(page.quests) ||
    !Array.isArray(page.newlyEarned) || typeof page.totalXp !== "number"
  )) {
    throw new Error("The planner server is out of date. Apply database migrations and restart the server.");
  }
  return page;
}

export async function plannerAction({ request }: ActionFunctionArgs) {
  try {
    const response = await fetch("/api/planner", {
      method: "POST",
      body: await request.formData(),
      signal: request.signal,
    });
    if (!response.ok) return { ok: false, error: `Could not submit the planner action (${response.status}).` } satisfies PlannerActionResult;
    return await response.json() as PlannerActionResult;
  } catch (error) {
    if (request.signal.aborted) throw error;
    return { ok: false, error: error instanceof Error ? error.message : "Could not submit the planner action." } satisfies PlannerActionResult;
  }
}
