import type { ActionFunctionArgs } from "react-router";
import type { RoutineActionResult } from "../../../../shared/planner/types";
import { routinePoints, type RoutineKind } from "../../../../shared/planner/routines";

/**
 * Changes the type used for a routine's future awards.
 * @param args - The routine ID parameter and form containing its new kind.
 * @returns The HTTP status and notification or API error.
 */
export async function updateRoutineAction({ request, params }: ActionFunctionArgs): Promise<RoutineActionResult> {
  const form = await request.formData();
  const kind = form.get("kind") as RoutineKind;
  const response = await fetch(`/api/routines/${encodeURIComponent(params.id as string)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind }),
    signal: request.signal,
  });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  return { status: response.status, message: `Moved to ${kind} (${routinePoints[kind]} pts).` };
}

/**
 * Saves a routine's checked state for the date identified in the URL.
 * @param args - The routine ID and date parameters and completed form field.
 * @returns The HTTP status, earned milestones, or API error.
 */
export async function routineCompletionAction({ request, params }: ActionFunctionArgs): Promise<RoutineActionResult> {
  const form = await request.formData();
  const completed = form.get("completed");
  const response = await fetch(`/api/routines/${encodeURIComponent(params.id as string)}/completions/${encodeURIComponent(params.date as string)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed: completed === "true" }),
    signal: request.signal,
  });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  const { earnedAchievements } = await response.json() as { earnedAchievements: string[] };
  return { status: response.status, earnedAchievements };
}

/**
 * Updates a synced task locally and through the existing Google orchestration.
 * @param args - The source, external ID and date parameters and completed form field.
 * @returns The HTTP status or API error.
 */
export async function externalCompletionAction({ request, params }: ActionFunctionArgs): Promise<RoutineActionResult> {
  const form = await request.formData();
  const completed = form.get("completed");
  const response = await fetch(`/api/external-tasks/${encodeURIComponent(params.source as string)}/${encodeURIComponent(params.id as string)}/completion`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: params.date, completed: completed === "true" }),
    signal: request.signal,
  });
  if (!response.ok) return { status: response.status, error: (await response.json() as { error: string }).error };
  return { status: response.status };
}
