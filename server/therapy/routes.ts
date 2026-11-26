import { Hono } from "hono";
import { isValidDateKey } from "../../shared/planner/utils";
import { noStore, reportServerError, requireSignIn } from "../http";
import { getTherapyPlan, setTherapyCompletion } from "./service";

/** Groups the therapy-plan and exercise-completion endpoints served under /api/therapy. */
export const therapyRoutes = new Hono();

/**
 * GET /api/therapy/sessions loads the exercises and progress shown on the therapy page.
 * Input: date query parameter in YYYY-MM-DD format.
 * Output: JSON containing therapy sessions, exercise completion states, and earned points.
 */
therapyRoutes.get("/sessions", noStore, requireSignIn, async (context) => {
  const date = context.req.query("date");
  if (!date || !isValidDateKey(date)) return context.json({ error: "That planner date is invalid." }, 400);
  try {
    return context.json(await getTherapyPlan(date));
  } catch (error) {
    return reportServerError(context, error, "Could not load therapy sessions.");
  }
});

/**
 * PUT saves an exercise check or uncheck and reports newly earned achievements.
 * Input: session ID, exercise ID, and date in the URL; completed in the JSON body.
 * Output: JSON containing date, sessionId, exerciseId, completed, and earnedAchievements.
 */
therapyRoutes.put("/sessions/:sessionId/exercises/:exerciseId/completions/:date", noStore, requireSignIn, async (context) => {
  const { sessionId, exerciseId, date } = context.req.param();
  if (!isValidDateKey(date) || !/^[a-z0-9_-]+$/.test(sessionId) || !/^[a-z0-9_-]+$/.test(exerciseId)) {
    return context.json({ error: "That physical therapy exercise or state is invalid." }, 400);
  }
  const { completed } = await context.req.json<{ completed: boolean }>();
  if (completed !== true && completed !== false) return context.json({ error: "That task state is invalid." }, 400);
  try {
    return context.json({ date, sessionId, exerciseId, completed,
      ...await setTherapyCompletion(date, sessionId, exerciseId, completed) });
  } catch (error) {
    if (error instanceof Error && error.message === "That physical therapy exercise is invalid.") {
      return context.json({ error: error.message }, 404);
    }
    return reportServerError(context, error, "Could not update therapy completion.");
  }
});
