import { dateKey, isValidDateKey } from "../../shared/planner/utils";
import type { SessionPage } from "../../shared/planner/types";
import { getMissingConfiguration, getSignedInEmail } from "../auth/service";
import { getSessionBalance } from "../points/service";
import { getSessionHeaderSummary } from "../gamification/service";

/**
 * Loads the account, selected date, and summary values used by the app shell.
 * @param request - The incoming request, including the selected date and auth error.
 * @returns The authenticated shell data or sign-in configuration state.
 */
export async function getSessionPage(request: Request): Promise<SessionPage> {
  const url = new URL(request.url);
  const authError = url.searchParams.get("authError")?.slice(0, 240) ?? "";
  const missingConfiguration = getMissingConfiguration();
  if (missingConfiguration.length) {
    return { authenticated: false, missingConfiguration, authError };
  }

  const email = await getSignedInEmail(request);
  if (!email) {
    return { authenticated: false, missingConfiguration: [], authError };
  }

  const today = dateKey(new Date());
  const requestedDate = url.searchParams.get("date");
  const selected = requestedDate && isValidDateKey(requestedDate) ? requestedDate : today;
  const [header, points] = await Promise.all([
    getSessionHeaderSummary(today),
    getSessionBalance(),
  ]);
  return {
    authenticated: true,
    email,
    today,
    selected,
    ...header,
    ...points,
  };
}
