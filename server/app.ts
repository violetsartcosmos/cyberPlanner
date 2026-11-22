import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { serveStatic } from "@hono/node-server/serve-static";
import { redirect } from "react-router";
import { beginGoogleAuthorization, completeGoogleAuthorization, endSession } from "./auth/service";
import { handlePlannerAction } from "./planner/dispatch";
import { getPlannerPage } from "./planner/page";

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
