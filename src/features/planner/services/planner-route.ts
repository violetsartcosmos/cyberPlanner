import type { LoaderFunctionArgs } from "react-router";
import type { PlannerPage } from "../../../../shared/planner/types";

/**
 * Loads the combined planner page for the selected date.
 * @param args - The React Router loader arguments.
 * @returns The planner page used by the layout and its child pages.
 */
export async function plannerLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const response = await fetch(`/api/planner${url.search}`, { signal: request.signal });
  if (!response.ok) throw new Error(`Could not load the planner (${response.status}).`);
  const page = await response.json() as PlannerPage;
  return page;
}
