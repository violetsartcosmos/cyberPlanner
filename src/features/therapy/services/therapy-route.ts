import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import type { RoutineActionResult, TherapyPlan } from "../../../../shared/planner/types";
import { dateKey, isValidDateKey } from "../../../../shared/planner/utils";

/**
 * Loads the selected date's therapy sessions from the therapy resource.
 * @param args - The React Router request containing the selected date query.
 * @returns The therapy sessions, completion states and earned points.
 */
export async function therapyLoader({ request }: LoaderFunctionArgs): Promise<TherapyPlan> {
  const requestedDate = new URL(request.url).searchParams.get("date");
  const selected = requestedDate && isValidDateKey(requestedDate) ? requestedDate : dateKey(new Date());
  const response = await fetch(`/api/therapy/sessions?date=${selected}`, {
    signal: request.signal,
  });
  if (!response.ok) throw new Error(`Could not load therapy sessions (${response.status}).`);
  return await response.json() as TherapyPlan;
}

/**
 * Saves a therapy exercise's checked state on its assigned date.
 * @param args - The session, exercise and date parameters and completed form field.
 * @returns The HTTP status, earned milestones, or API error.
 */
export async function therapyCompletionAction({ request, params }: ActionFunctionArgs): Promise<RoutineActionResult> {
  const form = await request.formData();
  const completed = form.get("completed");
  const response = await fetch(`/api/therapy/sessions/${params.sessionId}/exercises/${params.exerciseId}/completions/${params.date}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed: completed === "true" }),
    signal: request.signal,
  });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  const { earnedAchievements } = await response.json() as { earnedAchievements: string[] };
  return { status: response.status, earnedAchievements };
}
