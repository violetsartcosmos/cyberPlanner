import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { serveStatic } from "@hono/node-server/serve-static";
import { redirect } from "react-router";
import { beginGoogleAuthorization, completeGoogleAuthorization, endSession } from "./auth/service";
import { googleRoutes } from "./google/routes";
import { bookRoutes } from "./books/routes";
import { gamificationRoutes } from "./gamification/routes";
import { pointsRoutes } from "./points/routes";
import { journalRoutes } from "./journals/routes";
import { routineRoutes } from "./routines/routes";
import { therapyRoutes } from "./therapy/routes";
import { externalTaskRoutes } from "./external-tasks/routes";
import { plannerRoutes } from "./planner/routes";
import { sessionRoutes } from "./session/routes";

export const app = new Hono();

/** Returns journal errors as JSON while preserving other routes' error responses. */
app.onError(async (error, context) => {
  const isJournal = context.req.path === "/api/journals" || context.req.path.startsWith("/api/journals/");
  if (error instanceof HTTPException) {
    const response = error.getResponse();
    return isJournal ? context.json({ error: await response.text() }, error.status) : response;
  }
  console.error(error);
  return isJournal
    ? context.json({ error: "Internal Server Error" }, 500)
    : context.text("Internal Server Error", 500);
});

app.use("/api/*", csrf());
app.use("/auth/*", csrf());

// Resource routes share the same data and services. The /api/* CSRF middleware
// above also applies to requests that change data.

app.route("/api/journals", journalRoutes);
app.route("/api/routines", routineRoutes);
app.route("/api/therapy", therapyRoutes);
app.route("/api/external-tasks", externalTaskRoutes);
app.route("/api/books", bookRoutes);
app.route("/api", gamificationRoutes);
app.route("/api", pointsRoutes);
app.route("/api", googleRoutes);
app.route("/api", plannerRoutes);
app.route("/api", sessionRoutes);

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
