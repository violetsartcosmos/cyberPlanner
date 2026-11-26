import type { LoaderFunctionArgs } from "react-router";
import type { ProfileSummary } from "../../../../shared/planner/types";

/**
 * Loads completion history and XP resources owned by the profile page.
 * @param args - The cancellable profile loader request.
 * @returns The profile resources required to render the page.
 */
export async function profileLoader({ request }: LoaderFunctionArgs): Promise<ProfileSummary> {
  const response = await fetch("/api/profile", { signal: request.signal });
  if (!response.ok) throw new Error(`Could not load profile (${response.status}).`);
  return await response.json() as ProfileSummary;
}
