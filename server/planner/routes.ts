import { Hono } from "hono";
import { isValidDateKey } from "../../shared/planner/utils";
import { noStore, reportServerError, requireSignIn } from "../http";
import { getPlannerCalendarPage } from "./page";

export const plannerRoutes = new Hono();

/**
 * GET /api/planner/calendar loads dashboard and calendar resources.
 * Input: a selected `date` query parameter in YYYY-MM-DD format.
 * Output: JSON containing routine history, selected-date tasks and achievement progress.
 */
plannerRoutes.get("/planner/calendar", noStore, requireSignIn, async (context) => {
  const selected = context.req.query("date");
  if (!selected || !isValidDateKey(selected)) {
    return context.json({ error: "That planner date is invalid." }, 400);
  }
  try {
    return context.json(await getPlannerCalendarPage(selected));
  } catch (error) {
    return reportServerError(context, error, "Could not load calendar planner data.");
  }
});
