import type { LoaderFunctionArgs } from "react-router";
import type { SessionPage } from "../../../../shared/planner/types";

/**
 * Loads authenticated shell state and sign-in configuration for the selected date.
 * @param args - The React Router loader arguments.
 * @returns The app-shell state used by the layout and its child pages.
 */
export async function sessionLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const response = await fetch(`/api/session${url.search}`, { signal: request.signal });
  if (!response.ok) throw new Error(`Could not load the session (${response.status}).`);
  const session = await response.json() as SessionPage;
  return session;
}
