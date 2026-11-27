import assert from "node:assert/strict";
import { once } from "node:events";
import { resolve } from "node:path";
import test from "node:test";
import { serve } from "@hono/node-server";
import { createCookieSessionStorage } from "react-router";
import { createServer } from "vite";
import { Common } from "googleapis";

test("API routes preserve authentication and reject cross-origin submissions", async (t) => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test:test@localhost:5432/disposable",
    SESSION_SECRET: "temporary-api-test-session-secret",
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    GOOGLE_REDIRECT_URI: "http://localhost:5173/auth/callback",
    GOOGLE_ALLOWED_EMAIL: "api@example.test",
    GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  });
  const vite = await createServer({
    configFile: false,
    appType: "custom",
    plugins: [{
      name: "isolated-resource-services",
      transform(_code, id) {
        if (id.replaceAll("\\", "/").endsWith("/server/journals/service.ts")) {
          return `
            export const getJournal = (...args) => globalThis.journalRouteTest.getJournal(...args);
            export const createJournal = (...args) => globalThis.journalRouteTest.createJournal(...args);
            export const saveJournal = (...args) => globalThis.journalRouteTest.saveJournal(...args);
            export const deleteJournal = (...args) => globalThis.journalRouteTest.deleteJournal(...args);
            export const listJournals = (...args) => globalThis.journalRouteTest.listJournals(...args);
            export const listJournalDatesWithContent = (...args) => globalThis.journalRouteTest.listJournalDatesWithContent(...args);
          `;
        }
        if (!id.replaceAll("\\", "/").endsWith("/server/google/service.ts")) return;
        return `
          export { decryptRefreshToken } from "../auth/service";
          export const getGoogleCalendarClient = () => globalThis.googleRouteTest.getGoogleCalendarClient();
          export const syncGoogleTasks = (date) => globalThis.googleRouteTest.syncGoogleTasks(date);
          export const searchGmail = (query) => globalThis.googleRouteTest.searchGmail(query);
          export const importGmailMessage = (id, date) => globalThis.googleRouteTest.importGmailMessage(id, date);
          export const updateExternalCompletion = () => { throw new Error("Unexpected external write in isolated server test."); };
        `;
      },
    }],
    server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: ["**/audiblebooks/**"] } },
  });
  try {
    const { app } = await vite.ssrLoadModule("/server/app.ts");
    const page = await app.request("http://localhost/api/session?authError=denied");
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("cache-control"), "no-store");
    assert.deepEqual(await page.json(), {
      authenticated: false, missingConfiguration: [], authError: "denied",
    });
    const anonymousPlannerCalendar = await app.request("http://localhost/api/planner/calendar?date=2026-11-21");
    assert.equal(anonymousPlannerCalendar.status, 401);
    assert.equal(anonymousPlannerCalendar.headers.get("cache-control"), "no-store");
    const anonymousCalendar = await app.request("http://localhost/api/calendar");
    assert.equal(anonymousCalendar.status, 401);
    const anonymousBooks = await app.request("http://localhost/api/books");
    assert.equal(anonymousBooks.status, 401);
    assert.equal(anonymousBooks.headers.get("cache-control"), "no-store");
    const anonymousBookFile = await app.request("http://localhost/api/books/file?path=test.epub");
    assert.equal(anonymousBookFile.status, 401);
    assert.equal(anonymousBookFile.headers.get("cache-control"), "no-store");
    assert.deepEqual(await anonymousBookFile.json(), {
      error: "Sign in with your configured Google account first.",
    });
    assert.equal((await app.request("http://localhost/api/books/file?library=audiblebooks&path=test.m4b")).status, 401);
    assert.equal((await app.request("http://localhost/api/books/details?path=test.epub")).status, 401);
    assert.equal((await app.request("http://localhost/api/books/progress?path=test.epub")).status, 401);
    assert.equal((await app.request("http://localhost/api/books/progress", { method: "PUT", headers: { Origin: "http://localhost" } })).status, 401);
    const anonymousJournal = await app.request("http://localhost/api/journals/2026-11-21");
    assert.equal(anonymousJournal.status, 401);
    assert.deepEqual(await anonymousJournal.json(), { error: "Sign in with your configured Google account first." });
    for (const [method, path] of [
      ["GET", "/api/journals"],
      ["GET", "/api/journals/markers"],
      ["POST", "/api/journals"],
      ["DELETE", "/api/journals/2026-11-21"],
      ["GET", "/api/routines/completions?date=2026-11-21"],
      ["PATCH", "/api/routines/1"],
      ["PUT", "/api/routines/1/completions/2026-11-21"],
      ["POST", "/api/calendar/cal/events"],
      ["PATCH", "/api/calendar/cal/events/event"],
      ["POST", "/api/google/tasks/sync/2026-11-21"],
      ["GET", "/api/google/gmail/messages?query=in%3Ainbox"],
      ["POST", "/api/google/gmail/messages/mail/tasks/2026-11-21"],
    ]) {
      const response = await app.request(`http://localhost${path}`, { method, headers: { Origin: "http://localhost" } });
      assert.equal(response.status, 401);
      if (!path.startsWith("/api/journals")) {
        assert.equal(response.headers.get("cache-control"), "no-store");
      }
    }
    assert.equal((await app.request("http://localhost/api/journals/not/a/route")).status, 404);
    assert.equal((await app.request("http://localhost/api/routines/not/a/route")).status, 404);
    assert.equal((await app.request("http://localhost/api/quests")).status, 401);
    assert.equal((await app.request("http://localhost/api/quest-templates")).status, 401);
    assert.equal((await app.request("http://localhost/api/routines")).status, 401);
    assert.equal((await app.request("http://localhost/api/therapy/sessions?date=2026-11-21")).status, 401);
    assert.equal((await app.request("http://localhost/api/points?date=2026-11-21")).status, 401);
    assert.equal((await app.request("http://localhost/api/rewards")).status, 401);
    assert.equal((await app.request("http://localhost/api/achievements")).status, 401);
    assert.equal((await app.request("http://localhost/api/profile")).status, 401);

    const storage = createCookieSessionStorage({
      cookie: {
        name: "cyberplanner_session", httpOnly: true, path: "/", sameSite: "lax",
        secure: false, secrets: [process.env.SESSION_SECRET],
      },
    });
    const session = await storage.getSession();
    session.set("email", process.env.GOOGLE_ALLOWED_EMAIL);
    const cookie = await storage.commitSession(session);
    const journalHeaders = { Cookie: cookie, Origin: "http://localhost", "Content-Type": "application/json" };
    const sessionSecret = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      const shell = await app.request("http://localhost/api/session?authError=denied");
      assert.deepEqual(await shell.json(), {
        authenticated: false, missingConfiguration: ["SESSION_SECRET"], authError: "denied",
      });
    } finally {
      process.env.SESSION_SECRET = sessionSecret;
    }
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    try {
      const response = await app.request("http://localhost/api/rewards", { headers: { Cookie: cookie } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const calendar = await app.request("http://localhost/api/planner/calendar?date=invalid", {
        headers: { Cookie: cookie },
      });
      assert.equal(calendar.status, 400);
    } finally {
      process.env.GOOGLE_CLIENT_ID = googleClientId;
    }
    for (const query of ["", "?date=invalid", "?date=2026-02-30"]) {
      const response = await app.request(`http://localhost/api/planner/calendar${query}`, {
        headers: { Cookie: cookie },
      });
      assert.equal(response.status, 400);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { error: "That planner date is invalid." });
    }
    const calendarWrites = [];
    globalThis.googleRouteTest = {};
    t.after(() => { delete globalThis.googleRouteTest; });
    globalThis.googleRouteTest.getGoogleCalendarClient = async () => ({ events: {
      insert: async (params) => { calendarWrites.push(["POST", params]); },
      patch: async (params, options) => { calendarWrites.push(["PATCH", params, options]); },
    } });
    const sync = t.mock.fn(async (date) => {
      assert.equal(date, "2026-11-21");
      return 3;
    });
    globalThis.googleRouteTest.syncGoogleTasks = sync;
    globalThis.googleRouteTest.searchGmail = async (query) => {
      assert.equal(query, "in:inbox");
      return [{ id: "mail", subject: "Test", from: "test@example.test", snippet: "Summary" }];
    };
    let importCount = 0;
    const imported = t.mock.fn(async (id, date) => {
      assert.equal(id, "mail");
      assert.equal(date, "2026-11-21");
      return ++importCount === 1;
    });
    globalThis.googleRouteTest.importGmailMessage = imported;
    const eventInput = {
      title: " Test event ", start: "2026-11-21", end: "2026-11-22", allDay: true,
      etag: "", startTimeZone: "", endTimeZone: "",
    };
    for (const [method, path, body] of [
      ["POST", "/api/calendar/cal/events", eventInput],
      ["PATCH", "/api/calendar/cal/events/event", { ...eventInput, etag: '"etag"' }],
      ["POST", "/api/google/tasks/sync/2026-11-21"],
      ["POST", "/api/google/gmail/messages/mail/tasks/2026-11-21"],
    ]) {
      const denied = await app.request(`http://localhost${path}`, {
        method, headers: { ...journalHeaders, Origin: "http://attacker.example", "Content-Type": "text/plain" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal(denied.status, 403);
    }
    assert.equal(calendarWrites.length, 0);
    assert.equal(sync.mock.callCount(), 0);
    for (const [method, path, body] of [
      ["POST", "/api/calendar/cal/events", { ...eventInput, end: eventInput.start }],
      ["PATCH", "/api/calendar/cal/events/event", eventInput],
      ["POST", "/api/google/tasks/sync/2026-02-30"],
      ["POST", "/api/google/gmail/messages/mail/tasks/2026-02-30"],
      ["GET", "/api/google/gmail/messages?query=%20"],
    ]) {
      const invalid = await app.request(`http://localhost${path}`, {
        method, headers: journalHeaders, ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal(invalid.status, 400);
      assert.equal(invalid.headers.get("cache-control"), "no-store");
    }
    assert.equal(calendarWrites.length, 0);
    for (const [method, path, body, status] of [
      ["POST", "/api/calendar/cal/events", eventInput, 201],
      ["PATCH", "/api/calendar/cal/events/event", { ...eventInput, etag: '"etag"' }, 200],
      ["POST", "/api/google/tasks/sync/2026-11-21", undefined, 200],
      ["GET", "/api/google/gmail/messages?query=in%3Ainbox", undefined, 200],
      ["POST", "/api/google/gmail/messages/mail/tasks/2026-11-21", undefined, 201],
      ["POST", "/api/google/gmail/messages/mail/tasks/2026-11-21", undefined, 200],
    ]) {
      const saved = await app.request(`http://localhost${path}`, {
        method, headers: journalHeaders, ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal(saved.status, status);
      assert.equal(saved.headers.get("cache-control"), "no-store");
    }
    assert.deepEqual(calendarWrites[0][1].requestBody, {
      summary: "Test event", start: { date: "2026-11-21" }, end: { date: "2026-11-22" },
    });
    assert.deepEqual(calendarWrites[1][2], { headers: { "If-Match": '"etag"' } });
    const longEvent = await app.request("http://localhost/api/calendar/cal/events", {
      method: "POST", headers: journalHeaders,
      body: JSON.stringify({ ...eventInput, title: "x".repeat(1025), startTimeZone: "x".repeat(256) }),
    });
    assert.equal(longEvent.status, 201);
    assert.equal(calendarWrites[2][1].requestBody.summary.length, 1025);
    globalThis.googleRouteTest.getGoogleCalendarClient = async () => ({ events: {
      patch: async () => { throw new Common.GaxiosError("Precondition Failed", {}, new Response(null, { status: 412 })); },
    } });
    const conflict = await app.request("http://localhost/api/calendar/cal/events/event", {
      method: "PATCH", headers: journalHeaders, body: JSON.stringify({ ...eventInput, etag: '"etag"' }),
    });
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), { error: "This event changed in Google Calendar. Refresh and try again." });
    for (const query of ["path=test.epub", `path=test.epub&id=${"x".repeat(101)}`]) {
      const invalidBookmark = await app.request(`http://localhost/api/books/bookmarks?${query}`, {
        method: "DELETE", headers: journalHeaders,
      });
      assert.equal(invalidBookmark.status, 400);
      assert.deepEqual(await invalidBookmark.json(), { error: "Invalid bookmark." });
    }
    assert.equal((await app.request("http://localhost/api/journals/2026-02-30", { headers: journalHeaders })).status, 400);
    const rejectedJournal = await app.request("http://localhost/api/journals/2026-11-21", {
      method: "PUT", headers: { ...journalHeaders, Origin: "http://attacker.example", "Content-Type": "text/plain" },
      body: JSON.stringify({ content: "test" }),
    });
    assert.equal(rejectedJournal.status, 403);
    assert.deepEqual(await rejectedJournal.json(), { error: "Forbidden" });
    for (const [method, path, body] of [
      ["POST", "/api/journals", { date: "2026-11-21", content: "test" }],
      ["DELETE", "/api/journals/2026-11-21"],
      ["PATCH", "/api/routines/1", { kind: "main" }],
      ["PUT", "/api/routines/1/completions/2026-11-21", { completed: true }],
    ]) {
      const response = await app.request(`http://localhost${path}`, {
        method, headers: { ...journalHeaders, Origin: "http://attacker.example", "Content-Type": "text/plain" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal(response.status, 403);
      if (!path.startsWith("/api/journals")) assert.equal(await response.text(), "Forbidden");
    }
    for (const [method, path, body] of [
      ["POST", "/api/journals", { date: "2026-02-30", content: "test" }],
      ["POST", "/api/journals", { date: "20260228", content: "test" }],
      ["GET", "/api/journals/2020-W01-1"],
      ["DELETE", "/api/journals/2026-02-30"],
    ]) {
      const response = await app.request(`http://localhost${path}`, {
        method, headers: journalHeaders, ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "That planner date is invalid." });
    }
    for (const [method, path, body, status, message] of [
      ["POST", "/api/journals", {}, 400, "That planner date is invalid."],
      ["POST", "/api/journals", { date: 23 }, 400, "That planner date is invalid."],
      ["POST", "/api/journals", { date: "2026-11-21", content: null }, 422, "Journal content must be a string."],
      ["PUT", "/api/journals/2026-11-21", {}, 422, "Journal content must be a string."],
      ["PUT", "/api/journals/2026-11-21", { content: null }, 422, "Journal content must be a string."],
    ]) {
      const response = await app.request(`http://localhost${path}`, {
        method, headers: journalHeaders, body: JSON.stringify(body),
      });
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error: message });
    }
    for (const body of ["", "{"]) {
      const response = await app.request("http://localhost/api/journals", {
        method: "POST", headers: journalHeaders, body,
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "Malformed JSON in request body" });
    }
    const journalWrites = [];
    globalThis.journalRouteTest = {
      createJournal: async (date, content) => {
        journalWrites.push(["create", date, content]);
        return { content: content ?? "" };
      },
      saveJournal: async (date, content) => { journalWrites.push(["save", date, content]); },
      getJournal: async () => null,
      listJournals: async () => [
        { day: new Date("2020-01-02T00:00:00Z"), content: "" },
        { day: new Date("2020-01-01T00:00:00Z"), content: "entry" },
      ],
      listJournalDatesWithContent: async () => [{ day: new Date("2020-01-01T00:00:00Z") }],
    };
    t.after(() => { delete globalThis.journalRouteTest; });
    const journalList = await app.request("http://localhost/api/journals", { headers: journalHeaders });
    assert.deepEqual(await journalList.json(), [
      { date: "2020-01-02", content: "" },
      { date: "2020-01-01", content: "entry" },
    ]);
    const journalMarkers = await app.request("http://localhost/api/journals/markers", { headers: journalHeaders });
    assert.deepEqual(await journalMarkers.json(), [{ date: "2020-01-01" }]);
    const createdJournal = await app.request("http://localhost/api/journals", {
      method: "POST", headers: journalHeaders, body: JSON.stringify({ date: "2020-01-01" }),
    });
    assert.equal(createdJournal.status, 201);
    assert.deepEqual(await createdJournal.json(), { date: "2020-01-01", content: "" });
    const createJournal = globalThis.journalRouteTest.createJournal;
    const { Prisma } = await vite.ssrLoadModule("/server/generated/prisma/client.ts");
    globalThis.journalRouteTest.createJournal = async () => {
      throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" });
    };
    const duplicateJournal = await app.request("http://localhost/api/journals", {
      method: "POST", headers: journalHeaders, body: JSON.stringify({ date: "2020-01-01" }),
    });
    assert.equal(duplicateJournal.status, 409);
    assert.deepEqual(await duplicateJournal.json(), { error: "A journal entry already exists for that date." });
    globalThis.journalRouteTest.createJournal = createJournal;
    const savedJournal = await app.request("http://localhost/api/journals/2019-12-30", {
      method: "PUT", headers: journalHeaders, body: JSON.stringify({ content: "entry" }),
    });
    assert.deepEqual(await savedJournal.json(), { date: "2019-12-30", content: "entry" });
    assert.deepEqual(journalWrites, [
      ["create", "2020-01-01", undefined], ["save", "2019-12-30", "entry"],
    ]);
    const missingJournal = await app.request("http://localhost/api/journals/2020-01-01", { headers: journalHeaders });
    assert.equal(missingJournal.status, 404);
    assert.deepEqual(await missingJournal.json(), { error: "Journal not found." });
    globalThis.journalRouteTest.getJournal = async () => { throw new Error("simulated journal failure"); };
    const logged = t.mock.method(console, "error", () => {});
    try {
      const failedJournal = await app.request("http://localhost/api/journals/2020-01-01", { headers: journalHeaders });
      assert.equal(failedJournal.status, 500);
      assert.deepEqual(await failedJournal.json(), { error: "Internal Server Error" });
      assert.match(String(logged.mock.calls[0].arguments[0]), /simulated journal failure/);
    } finally {
      logged.mock.restore();
    }
    for (const [method, path, body] of [
      ["PATCH", "/api/quests/example", {}],
      ["PATCH", "/api/quests/example", { deleted: true }],
    ]) {
      assert.equal((await app.request(`http://localhost${path}`, {
        method, headers: journalHeaders, body: JSON.stringify(body),
      })).status, 400);
    }
    for (const [method, path, body] of [
      ["GET", "/api/routines/completions?date=2026-02-30"],
      ["GET", "/api/therapy/sessions"],
      ["PATCH", "/api/routines/0", { kind: "main" }],
      ["PUT", "/api/routines/1/completions/2026-02-30", { completed: true }],
      ["PUT", "/api/routines/1/completions/2026-11-21", { completed: "true" }],
      ["PUT", "/api/therapy/sessions/am/exercises/glute/completions/2026-11-21", { completed: "true" }],
      ["GET", "/api/points?date=bad"],
      ["GET", "/api/external-tasks"],
      ["PUT", "/api/external-tasks/unknown/task/completion", { date: "2026-11-21", completed: true }],
      ["PUT", "/api/external-tasks/gmail/task/completion", { date: "2026-11-21", completed: "true" }],
      ["PUT", "/api/external-tasks/gmail/task/completion", { date: "2026-02-30", completed: false }],
      ["PUT", "/api/external-tasks/gmail/task/completion", { date: 42, completed: true }],
    ]) {
      assert.equal((await app.request(`http://localhost${path}`, {
        method, headers: journalHeaders, ...(body ? { body: JSON.stringify(body) } : {}),
      })).status, 400);
    }
    const missingBookPath = await app.request("http://localhost/api/books/details", { headers: { Cookie: cookie } });
    assert.equal(missingBookPath.status, 400);
    assert.deepEqual(await missingBookPath.json(), { error: "Invalid book." });
    const crossOriginProgress = await app.request("http://localhost/api/books/progress", {
      method: "PUT", headers: { Cookie: cookie, Origin: "http://attacker.example", "Content-Type": "text/plain" },
      body: JSON.stringify({ path: "test.epub", position: "epubcfi(/6/2)", revision: 0 }),
    });
    assert.equal(crossOriginProgress.status, 403);
    assert.equal((await app.request("http://localhost/api/books/file?library=unknown&path=test.m4b", { headers: { Cookie: cookie } })).status, 400);
    const invalidDetails = await app.request("http://localhost/api/books/details", {
      method: "POST",
      headers: { Cookie: cookie, Origin: "http://localhost", "Content-Type": "application/json" },
      body: JSON.stringify({ path: "test.epub", details: { url: "https://example.com" } }),
    });
    assert.equal(invalidDetails.status, 400);
    const emptyDetailsPath = await app.request("http://localhost/api/books/details", {
      method: "POST",
      headers: { Cookie: cookie, Origin: "http://localhost", "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "",
        details: { url: "https://en.wikipedia.org/wiki/Test", description: "", image: null },
      }),
    });
    assert.equal(emptyDetailsPath.status, 400);
    assert.deepEqual(await emptyDetailsPath.json(), { error: "Invalid book details." });
    const invalidCover = await app.request("http://localhost/api/books/details", {
      method: "POST",
      headers: { Cookie: cookie, Origin: "http://localhost", "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "test.epub",
        details: {
          url: "https://en.wikipedia.org/wiki/Test",
          description: "",
          image: {
            url: "https://upload.wikimedia.org/example",
            page: "https://commons.wikimedia.org/wiki/File:Test.jpg",
            title: "Test",
            author: "Test",
            license: "CC BY",
          },
        },
        cover: { data: "bm90YW4=", type: "image/png" },
      }),
    });
    assert.equal(invalidCover.status, 400);
    assert.deepEqual(await invalidCover.json(), { error: "Invalid cover image." });
    const invalidLibrary = await app.request("http://localhost/api/books/rename", {
      method: "POST",
      headers: { Cookie: cookie, Origin: "http://localhost", "Content-Type": "application/json" },
      body: JSON.stringify({ path: "test.epub", title: "Test", library: "unknown" }),
    });
    assert.equal(invalidLibrary.status, 400);
    assert.deepEqual(await invalidLibrary.json(), { error: "Invalid library." });
    const largeDetails = await app.request("http://localhost/api/books/details", {
      method: "POST",
      headers: { Cookie: cookie, Origin: "http://localhost", "Content-Type": "application/json" },
      body: JSON.stringify({ path: "test.epub", details: { text: "x".repeat(25000) } }),
    });
    assert.deepEqual(await largeDetails.json(), { error: "Invalid book details." });
    const invalidBook = await app.request("http://localhost/api/books/file?path=..%2Fsecret.epub", { headers: { Cookie: cookie } });
    assert.equal(invalidBook.status, 404);
    assert.equal(invalidBook.headers.get("cache-control"), "no-store");
    const invalidCalendarRange = await app.request("http://localhost/api/calendar?start=bad&end=bad", { headers: { Cookie: cookie } });
    assert.equal(invalidCalendarRange.status, 400);
    const missingCalendarRange = await app.request("http://localhost/api/calendar", { headers: { Cookie: cookie } });
    assert.equal(missingCalendarRange.status, 400);
    const signIn = await app.request("http://localhost/auth/google");
    assert.equal(signIn.status, 302);
    const authorization = new URL(signIn.headers.get("location"));
    assert.equal(authorization.hostname, "accounts.google.com");
    assert.ok(authorization.searchParams.get("state"));
    assert.match(authorization.searchParams.get("scope"), /calendar\.events/);
    assert.match(authorization.searchParams.get("scope"), /calendar\.calendarlist\.readonly/);
    assert.match(signIn.headers.get("set-cookie"), /cyberplanner_session=/);
    for (const [state, includeCookie] of [
      [authorization.searchParams.get("state"), false],
      ["incorrect-state", true],
    ]) {
      const callback = await app.request(`http://localhost/auth/callback?code=fake&state=${state}`, {
        headers: includeCookie ? { Cookie: signIn.headers.get("set-cookie") } : {},
      });
      assert.equal(callback.status, 302);
      assert.match(callback.headers.get("location"), /state%20validation%20failed/);
    }
    const callback = await app.request("http://localhost/auth/callback?error=access_denied");
    assert.equal(callback.status, 302);
    assert.match(callback.headers.get("location"), /^\/\?authError=/);
    assert.equal((await app.request("http://localhost/api/not-found")).status, 404);
    assert.equal((await app.request("http://localhost/api/books/not-found")).status, 404);
    assert.equal((await app.request("http://localhost/api/planner")).status, 404);
    assert.equal((await app.request("http://localhost/api/planner", {
      method: "POST",
      headers: { Origin: "http://localhost" },
    })).status, 404);

    const api = serve({ fetch: app.fetch, port: 0 });
    await once(api, "listening");
    const address = api.address();
    assert.ok(address && typeof address !== "string");
    process.env.PORT = String(address.port);
    let client;
    try {
      client = await createServer({
        configFile: "vite.config.ts",
        logLevel: "silent",
        server: { port: 0, strictPort: false, ws: false },
      });
      await client.listen();
      const clientAddress = client.httpServer.address();
      assert.ok(clientAddress && typeof clientAddress !== "string");
      const origin = `http://localhost:${clientAddress.port}`;
      const html = await fetch(origin);
      assert.equal(html.status, 200);
      assert.match(await html.text(), /CyberPlanner/);
      const proxied = await fetch(`${origin}/api/session`);
      assert.equal((await proxied.json()).authenticated, false);
      const login = await fetch(`${origin}/auth/google`, { redirect: "manual" });
      assert.equal(login.status, 302);
      assert.equal(new URL(login.headers.get("location")).hostname, "accounts.google.com");
      const backendPath = resolve("server/external-tasks/service.ts").replaceAll("\\", "/");
      const backendModule = await fetch(`${origin}/@fs/${backendPath}`);
      assert.notEqual(backendModule.status, 200);
    } finally {
      if (client) await client.close();
      await new Promise((resolve, reject) => api.close((error) => error ? reject(error) : resolve()));
    }
  } finally {
    await vite.close();
  }
});
