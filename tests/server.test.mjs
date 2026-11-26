import assert from "node:assert/strict";
import { once } from "node:events";
import { resolve } from "node:path";
import test from "node:test";
import { serve } from "@hono/node-server";
import { createCookieSessionStorage } from "react-router";
import { createServer } from "vite";

test("API routes preserve authentication and reject cross-origin submissions", async () => {
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
    server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: ["**/audiblebooks/**"] } },
  });
  try {
    const { app } = await vite.ssrLoadModule("/server/app.ts");
    const page = await app.request("http://localhost/api/planner?authError=denied");
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("cache-control"), "no-store");
    assert.deepEqual(await page.json(), {
      authenticated: false, missingConfiguration: [], authError: "denied",
    });
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
    assert.equal((await app.request("http://localhost/api/journals/2026-11-21")).status, 401);
    assert.equal((await app.request("http://localhost/api/quests")).status, 401);
    assert.equal((await app.request("http://localhost/api/routines")).status, 401);
    assert.equal((await app.request("http://localhost/api/therapy/sessions?date=2026-11-21")).status, 401);
    assert.equal((await app.request("http://localhost/api/points?date=2026-11-21")).status, 401);
    assert.equal((await app.request("http://localhost/api/achievements")).status, 401);

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
    for (const query of ["path=test.epub", `path=test.epub&id=${"x".repeat(101)}`]) {
      const invalidBookmark = await app.request(`http://localhost/api/books/bookmarks?${query}`, {
        method: "DELETE", headers: journalHeaders,
      });
      assert.equal(invalidBookmark.status, 400);
      assert.deepEqual(await invalidBookmark.json(), { error: "Invalid bookmark." });
    }
    assert.equal((await app.request("http://localhost/api/journals/2026-02-30", { headers: journalHeaders })).status, 400);
    assert.equal((await app.request("http://localhost/api/journals/2026-11-21", {
      method: "PUT", headers: { ...journalHeaders, Origin: "http://attacker.example", "Content-Type": "text/plain" },
      body: JSON.stringify({ content: "test" }),
    })).status, 403);
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
    const submit = (origin, includeCookie = true) => app.request("http://localhost/api/planner", {
      method: "POST",
      headers: { Origin: origin, ...(includeCookie ? { Cookie: cookie } : {}) },
      body: new URLSearchParams({ intent: "not-an-action" }),
    });
    const denied = await submit("http://attacker.example");
    assert.equal(denied.status, 403);
    const anonymous = await submit("http://localhost", false);
    assert.deepEqual(await anonymous.json(), {
      ok: false, error: "Sign in with your configured Google account first.",
    });
    const signedIn = await submit("http://localhost");
    assert.deepEqual(await signedIn.json(), { ok: false, error: "Unknown planner action." });

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
      const proxied = await fetch(`${origin}/api/planner`);
      assert.equal((await proxied.json()).authenticated, false);
      const action = await fetch(`${origin}/api/planner`, {
        method: "POST",
        headers: { Origin: origin, Cookie: cookie },
        body: new URLSearchParams({ intent: "not-an-action" }),
      });
      assert.deepEqual(await action.json(), { ok: false, error: "Unknown planner action." });
      const login = await fetch(`${origin}/auth/google`, { redirect: "manual" });
      assert.equal(login.status, 302);
      assert.equal(new URL(login.headers.get("location")).hostname, "accounts.google.com");
      const backendPath = resolve("server/planner/service.ts").replaceAll("\\", "/");
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
