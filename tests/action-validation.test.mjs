import assert from "node:assert/strict";
import test from "node:test";
import { createCookieSessionStorage } from "react-router";
import { createServer } from "vite";

test("planner actions reject invalid dates, states, and unsupported actions", async () => {
  process.env.SESSION_SECRET = "temporary-action-test-session-secret";
  process.env.GOOGLE_ALLOWED_EMAIL = "actions@example.test";
  const vite = await createServer({
    configFile: false,
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: ["**/audiblebooks/**"] } },
  });
  try {
    const { handlePlannerAction } = await vite.ssrLoadModule("/server/planner/dispatch.ts");
    const storage = createCookieSessionStorage({
      cookie: {
        name: "cyberplanner_session", httpOnly: true, path: "/", sameSite: "lax",
        secure: process.env.NODE_ENV === "production", secrets: [process.env.SESSION_SECRET],
      },
    });
    const session = await storage.getSession();
    session.set("email", process.env.GOOGLE_ALLOWED_EMAIL);
    const cookie = await storage.commitSession(session);
    const file = new File(["text"], "field.txt", { type: "text/plain" });
    async function submit(values) {
      const body = new FormData();
      for (const [key, value] of Object.entries(values)) body.set(key, value);
      return handlePlannerAction(new Request("http://localhost/", {
        method: "POST", headers: { Cookie: cookie }, body,
      }));
    }
    const cases = [
      [{ intent: file }, "Unknown planner action."],
      [{ intent: "save_note", date: "2026-11-21" }, "Unknown planner action."],
      [{ intent: "save_journal", date: "bad", journal: "entry" }, "That planner date is invalid."],
      [{ intent: "toggle_builtin", date: "2026-11-21", taskId: "1", completed: "yes" }, "That task state is invalid."],
      [{ intent: "toggle_physical_therapy", date: "bad", sessionId: "am", exerciseId: "glute", completed: "true" }, "That physical therapy exercise or state is invalid."],
      [{ intent: "toggle_physical_therapy", date: "2026-11-21", sessionId: "am", exerciseId: "glute", completed: "yes" }, "That physical therapy exercise or state is invalid."],
      [{ intent: "toggle_external", date: "2026-11-21", source: "gmail", externalId: "message", completed: "yes" }, "That synced task is invalid."],
      [{ intent: "sync_google_tasks", date: "bad" }, "That planner date is invalid."],
      [{ intent: "save_calendar_event", calendarId: "cal", eventId: "event", etag: "", title: "Test", start: "2026-11-22", end: "2026-11-23", allDay: "true", startTimeZone: "", endTimeZone: "" }, "Refresh the event before updating it."],
      [{ intent: "save_calendar_event", calendarId: "cal", eventId: "", etag: "", title: "Test", start: "2026-11-22", end: "2026-11-22", allDay: "true", startTimeZone: "", endTimeZone: "" }, "The event end must be after its valid start."],
      [{ intent: "save_calendar_event", calendarId: "cal", eventId: "", etag: "", title: "Test", start: "2026-11-22T10:00:00.000Z", end: "2026-11-22T09:00:00.000Z", allDay: "false", startTimeZone: "", endTimeZone: "" }, "The event end must be after its valid start."],
      [{ intent: "search_gmail", query: "" }, "Enter a Gmail search query."],
      [{ intent: "import_gmail", date: "2026-11-21", messageId: "" }, "Choose an email and planner date first."],
      [{ intent: "import_legacy", payload: file }, "Unknown planner action."],
      [{ intent: "redeem_reward", rewardId: file }, "That reward is not available."],
      [{ intent: "advance_achievement", id: "water" }, "Unknown planner action."],
      [{ intent: "delete_achievement", id: "water" }, "Unknown planner action."],
      [{ intent: "save_achievement", id: "water", title: "Test", description: "Test", category: "Daily & Routine", tier: "Common", xp: "25", target: "1", tracking: "points", reward: "" }, "Existing achievements cannot be edited."],
    ];
    for (const [values, error] of cases) {
      assert.deepEqual(await submit(values), { ok: false, error });
    }
  } finally {
    await vite.close();
  }
});
