import assert from "node:assert/strict";
import test from "node:test";
import { createCookieSessionStorage } from "react-router";
import { createServer } from "vite";

test("planner actions reject missing and file-valued fields", async () => {
  process.env.SESSION_SECRET = "temporary-action-test-session-secret";
  process.env.GOOGLE_ALLOWED_EMAIL = "actions@example.test";
  const vite = await createServer({
    configFile: false,
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false },
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
      [{ intent: "save_note", date: "2026-11-21" }, "That note is invalid."],
      [{ intent: "save_note", date: "2026-11-21", note: file }, "That note is invalid."],
      [{ intent: "save_journal", date: "bad", journal: "entry" }, "That planner date is invalid."],
      [{ intent: "save_journal", date: "2026-11-21", journal: file }, "That journal entry is invalid."],
      [{ intent: "save_journal", date: "2026-11-21", journal: "x".repeat(10_001) }, "Journal entries must be under 10,000 characters."],
      [{ intent: "toggle_builtin", date: "2026-11-21", taskId: file }, "That planner task is invalid."],
      [{ intent: "toggle_external", date: "2026-11-21", source: "gmail", externalId: file, completed: "true" }, "That synced task is invalid."],
      [{ intent: "sync_google_tasks", date: "bad" }, "That planner date is invalid."],
      [{ intent: "search_gmail", query: file }, "Enter a Gmail search query (up to 256 characters)."],
      [{ intent: "import_gmail", date: "2026-11-21", messageId: file }, "Choose an email and planner date first."],
      [{ intent: "import_legacy", payload: file }, "Unknown planner action."],
      [{ intent: "redeem_reward", rewardId: file }, "That reward is not available."],
    ];
    for (const [values, error] of cases) {
      assert.deepEqual(await submit(values), { ok: false, error });
    }
  } finally {
    await vite.close();
  }
});
