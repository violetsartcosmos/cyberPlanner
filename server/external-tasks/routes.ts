import { Hono } from "hono";
import { isValidDateKey } from "../../shared/planner/utils";
import { noStore, reportServerError, requireSignIn } from "../http";
import { updateExternalCompletion } from "../google/service";
import { getExternalTasks } from "./service";

/** Groups the task-list and completion endpoints served under /api/external-tasks. */
export const externalTaskRoutes = new Hono();

/**
 * GET /api/external-tasks loads Google and Gmail tasks for display.
 * Input: date query parameter in YYYY-MM-DD format.
 * Output: JSON array of tasks for the selected date, including tasks without a due date.
 */
externalTaskRoutes.get("/", noStore, requireSignIn, async (context) => {
  const date = context.req.query("date");
  if (!date || !isValidDateKey(date)) return context.json({ error: "That planner date is invalid." }, 400);
  try {
    return context.json(await getExternalTasks(date));
  } catch (error) {
    return reportServerError(context, error, "Could not load synced tasks.");
  }
});

/**
 * PUT saves a task's completion change in the planner and, for Google tasks, in Google.
 * Input: source and task ID in the URL; date and completed in the JSON body.
 * Output: JSON containing source, id, date, and the saved completed state.
 */
externalTaskRoutes.put("/:source/:id/completion", noStore, requireSignIn, async (context) => {
  const { source, id } = context.req.param();
  const { date, completed } = await context.req.json<{ date: string; completed: boolean }>();
  if ((source !== "google" && source !== "gmail") || !id || !isValidDateKey(date) ||
      (completed !== true && completed !== false)) {
    return context.json({ error: "That synced task is invalid." }, 400);
  }
  try {
    if (!(await updateExternalCompletion(source, id, completed, date))) {
      return context.json({ error: "That synced task no longer exists." }, 404);
    }
    return context.json({ source, id, date, completed });
  } catch (error) {
    if (error instanceof Error && error.message === "That synced task no longer exists.") {
      return context.json({ error: error.message }, 404);
    }
    return reportServerError(context, error, "Could not update synced task.");
  }
});
