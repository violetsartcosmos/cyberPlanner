import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { serveStatic } from "@hono/node-server/serve-static";
import { redirect } from "react-router";
import { beginGoogleAuthorization, completeGoogleAuthorization, endSession } from "./auth/service";
import { handlePlannerAction } from "./planner/dispatch";
import { getPlannerPage } from "./planner/page";
import { googleRoutes } from "./google/routes";
import { bookRoutes } from "./books/routes";
import { gamificationRoutes } from "./gamification/routes";
import { pointsRoutes } from "./points/routes";
import { noStore, requireSignIn } from "./http";
import { journalRoutes } from "./journals/routes";
import { routineRoutes } from "./routines/routes";
import { therapyRoutes } from "./therapy/routes";
import { externalTaskRoutes } from "./external-tasks/routes";
import { plannerRoutes } from "./planner/routes";

export const app = new Hono();

app.use("/api/*", csrf());
app.use("/auth/*", csrf());

// Resource routes below are separate from /api/planner, but use the same data
// and services. `noStore` prevents caching; `requireSignIn` checks the session.
// The /api/* CSRF middleware above also applies to requests that change data.

app.route("/api/journals", journalRoutes);
app.route("/api/routines", routineRoutes);
app.route("/api/therapy", therapyRoutes);
app.route("/api/external-tasks", externalTaskRoutes);
app.route("/api/books", bookRoutes);
app.route("/api", gamificationRoutes);
app.route("/api", pointsRoutes);
app.route("/api", googleRoutes);
app.route("/api", plannerRoutes);

// Loads planner data for the current request.
app.get("/api/planner", noStore, async (context) => {
  return context.json(await getPlannerPage(context.req.raw));
});

// Validates and dispatches a planner action.
app.post("/api/planner", noStore, async (context) => {
  return context.json(await handlePlannerAction(context.req.raw));
});

// Starts the configured Google OAuth flow.
app.get("/auth/google", () => beginGoogleAuthorization());
// Completes OAuth and redirects rejected authorization responses to the app.
app.get("/auth/callback", async (context) => {
  try {
    return await completeGoogleAuthorization(context.req.raw);
  } catch (error) {
    if (error instanceof Response) {
      const message = (await error.text()).slice(0, 240);
      return redirect(`/?authError=${encodeURIComponent(message)}`);
    }
    throw error;
  }
});
// Ends the current signed-in session.
app.post("/auth/logout", (context) => endSession(context.req.raw));

app.all("/api/*", (context) => context.notFound());
app.all("/auth/*", (context) => context.notFound());
if (process.env.NODE_ENV === "production") {
  app.get("*", serveStatic({ root: "./build/client" }));
  app.get("*", serveStatic({ path: "./build/client/index.html" }));
}
