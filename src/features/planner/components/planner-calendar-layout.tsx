import { Outlet, useLoaderData } from "react-router";
import { useNotification } from "@/components/notifications";
import { usePlannerContext } from "@/features/planner/hooks/planner-context";
import { usePlannerTaskController } from "@/features/planner/hooks/use-planner-controller";
import { plannerCalendarLoader } from "@/features/planner/services/planner-calendar-route";
import type { PlannerCalendarData } from "../../../../shared/planner/types";
import type { PlannerOutletContext } from "@/features/planner/types/planner-outlet-context";

/**
 * Provides page-owned calendar data and task actions to dashboard routes.
 * @returns The nested dashboard or calendar page with its task context.
 */
export default function PlannerCalendarLayout() {
  const page = useLoaderData<typeof plannerCalendarLoader>();
  const context = usePlannerContext();
  if (!page) throw new Error("Could not load planner task data for the signed-in session.");
  return <PlannerCalendarContent page={page} context={context} />;
}

/**
 * Coordinates task actions and exposes the calendar page context.
 * @param props - The selected-date resources and shared planner context.
 * @returns The dashboard or calendar route outlet.
 */
function PlannerCalendarContent({
  page,
  context,
}: {
  page: PlannerCalendarData;
  context: PlannerOutletContext;
}) {
  const { outletContext, toggleFetcher } = usePlannerTaskController(page, context);

  useNotification(toggleFetcher.state === "idle" ? toggleFetcher.data?.error : "");
  useNotification(toggleFetcher.state === "idle" && toggleFetcher.data?.earnedAchievements?.length
    ? `Achievement milestone earned: ${toggleFetcher.data.earnedAchievements.join(", ")}!` : "", "notice");

  return <Outlet context={outletContext} />;
}
