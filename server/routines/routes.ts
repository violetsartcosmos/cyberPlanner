import { Hono } from "hono";
import { isValidDateKey } from "../../shared/planner/utils";
import { routineKinds } from "../../shared/planner/routines";
import { getDatabase } from "../db/client";
import { noStore, reportServerError, requireSignIn } from "../http";
import { loadRoutines, routineId } from "./definitions";
import { getRoutineCompletions, setRoutineCompletion, updateRoutineKind } from "./service";

export const routineRoutes = new Hono();

routineRoutes.get("/", noStore, requireSignIn, async (context) => {
  try {
    return context.json(await loadRoutines(getDatabase()));
  } catch (error) {
    return reportServerError(context, error, "Could not load routines.");
  }
});

routineRoutes.get("/completions", noStore, requireSignIn, async (context) => {
  const date = context.req.query("date");
  if (!date || !isValidDateKey(date)) return context.json({ error: "That planner date is invalid." }, 400);
  try {
    return context.json({ date, taskIds: await getRoutineCompletions(date) });
  } catch (error) {
    return reportServerError(context, error, "Could not load routine completions.");
  }
});

routineRoutes.patch("/:id", noStore, requireSignIn, async (context) => {
  const id = routineId(context.req.param("id"));
  if (id === null) return context.json({ error: "That routine is invalid." }, 400);
  const input = await context.req.json<{ kind: string }>();
  const kind = routineKinds.find((item) => item === input.kind);
  if (!kind) return context.json({ error: "That routine type is invalid." }, 400);
  try {
    if (!(await updateRoutineKind(id, kind))) {
      return context.json({ error: "That routine no longer exists." }, 404);
    }
    return context.json({ id, kind });
  } catch (error) {
    return reportServerError(context, error, "Could not update routine.");
  }
});

routineRoutes.put("/:id/completions/:date", noStore, requireSignIn, async (context) => {
  const id = context.req.param("id");
  const date = context.req.param("date");
  if (routineId(id) === null || !isValidDateKey(date)) {
    return context.json({ error: "That planner task is invalid." }, 400);
  }
  const { completed } = await context.req.json<{ completed: boolean }>();
  if (completed !== true && completed !== false) return context.json({ error: "That task state is invalid." }, 400);
  try {
    return context.json({ date, taskId: id, completed,
      ...await setRoutineCompletion(date, id, completed) });
  } catch (error) {
    if (error instanceof Error && error.message === "That planner task is invalid.") {
      return context.json({ error: error.message }, 404);
    }
    return reportServerError(context, error, "Could not update routine completion.");
  }
});
