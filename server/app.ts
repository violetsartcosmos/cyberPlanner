import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { serveStatic } from "@hono/node-server/serve-static";
import { redirect } from "react-router";
import { beginGoogleAuthorization, completeGoogleAuthorization, endSession } from "./auth/service";
import { handlePlannerAction } from "./planner/dispatch";
import { getPlannerPage } from "./planner/page";
import { getSignedInEmail } from "./auth/service";
import { getCalendarData, validCalendarRange } from "./google/calendar";

export const app = new Hono();

app.use("/api/*", csrf());
app.use("/auth/*", csrf());

app.get("/api/planner", async (context) => {
  context.header("Cache-Control", "no-store");
  return context.json(await getPlannerPage(context.req.raw));
});

app.post("/api/planner", async (context) => {
  context.header("Cache-Control", "no-store");
  return context.json(await handlePlannerAction(context.req.raw));
});

app.get("/api/calendar", async (context) => {
  context.header("Cache-Control", "no-store");
  if (!(await getSignedInEmail(context.req.raw))) {
    return context.json({ error: "Sign in with your configured Google account first." }, 401);
  }
  const start = context.req.query("start") ?? "";
  const end = context.req.query("end") ?? "";
  if (!validCalendarRange(start, end)) {
    return context.json({ error: "Invalid calendar date range." }, 400);
  }
  try {
    return context.json(await getCalendarData(start, end));
  } catch {
    console.error("Google Calendar load failed.");
    return context.json({ error: "Could not load Google Calendar. Check that the Calendar API is enabled and reconnect Google to grant calendar access." }, 502);
  }
});

app.get("/auth/google", () => beginGoogleAuthorization());
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
app.post("/auth/logout", (context) => endSession(context.req.raw));

app.all("/api/*", (context) => context.notFound());
app.all("/auth/*", (context) => context.notFound());
if (process.env.NODE_ENV === "production") {
  app.get("*", serveStatic({ root: "./build/client" }));
  app.get("*", serveStatic({ path: "./build/client/index.html" }));
}
