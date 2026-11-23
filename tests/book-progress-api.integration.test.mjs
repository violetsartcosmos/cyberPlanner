import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createCookieSessionStorage } from "react-router";

test("authenticated progress API atomically rejects competing saves", async () => {
  if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a disposable migrated database.");
  if (!process.env.BOOK_PROGRESS_API_CHILD) {
    const root = await mkdtemp(join(tmpdir(), "cyberplanner-progress-api-"));
    try {
      await mkdir(join(root, "ebooks"));
      await writeFile(join(root, "ebooks", "Test.epub"), "test");
      const child = spawn(process.execPath, ["--import", import.meta.resolve("tsx"), fileURLToPath(import.meta.url)], {
        cwd: root, env: { ...process.env, BOOK_PROGRESS_API_CHILD: "1" }, stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.on("data", (chunk) => { output += chunk; });
      const exit = await new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("close", resolve);
      });
      assert.equal(exit, 0, output);
    } finally { await rm(root, { recursive: true, force: true }); }
    return;
  }
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    SESSION_SECRET: "temporary-progress-test-session-secret",
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    GOOGLE_REDIRECT_URI: "http://localhost/auth/callback",
    GOOGLE_ALLOWED_EMAIL: "progress@example.test",
    GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  });
  let db;
  try {
    const { app } = await import("../server/app.ts");
    const { getDatabase } = await import("../server/db/client.ts");
    db = getDatabase();
    const sessions = createCookieSessionStorage({
      cookie: { name: "cyberplanner_session", httpOnly: true, path: "/", sameSite: "lax", secure: false, secrets: [process.env.SESSION_SECRET] },
    });
    const session = await sessions.getSession();
    session.set("email", process.env.GOOGLE_ALLOWED_EMAIL);
    const cookie = await sessions.commitSession(session);
    const headers = { Cookie: cookie, Origin: "http://localhost", "Content-Type": "application/json" };
    const request = (position, revision) => app.request("http://localhost/api/books/progress", {
      method: "PUT", headers, body: JSON.stringify({ path: "Test.epub", position, revision }),
    });
    const initial = await app.request("http://localhost/api/books/progress?path=Test.epub", { headers });
    assert.deepEqual(await initial.json(), { position: null, revision: 0 });
    const results = await Promise.all([request("epubcfi(/6/2)", 0), request("epubcfi(/6/4)", 0)]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    const successful = await results.find((result) => result.status === 200).json();
    const conflict = await results.find((result) => result.status === 409).json();
    assert.deepEqual(conflict, successful);
    assert.equal(successful.revision, 1);
    assert.equal((await request("epubcfi(/6/8)", 1)).status, 200);
    assert.equal((await app.request("http://localhost/api/books/progress?path=missing.epub", { headers })).status, 404);
  } finally {
    if (db) {
      await db.bookData.deleteMany({ where: { library: "ebooks", path: "Test.epub" } });
      await db.$disconnect();
    }
  }
});
