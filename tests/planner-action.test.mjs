import assert from "node:assert/strict";
import test from "node:test";
import { plannerAction } from "../src/features/planner/services/planner-route.ts";

function request(signal) {
  return new Request("http://localhost/profile", {
    method: "POST",
    body: new URLSearchParams({ intent: "save_achievement" }),
    signal,
  });
}

test("planner action reports HTTP and network failures without throwing", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
  assert.deepEqual(await plannerAction({ request: request() }), {
    ok: false, error: "Could not submit the planner action (503).",
  });
  fetch.mock.mockImplementation(async () => { throw new Error("Network unavailable"); });
  assert.deepEqual(await plannerAction({ request: request() }), {
    ok: false, error: "Network unavailable",
  });
});

test("planner action preserves successful results and propagates cancelled requests", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true, message: "Saved." }));
  assert.deepEqual(await plannerAction({ request: request() }), { ok: true, message: "Saved." });
  const controller = new AbortController();
  controller.abort();
  fetch.mock.mockImplementation(async () => { throw new DOMException("Aborted", "AbortError"); });
  await assert.rejects(plannerAction({ request: request(controller.signal) }), { name: "AbortError" });
});

test("planner forms send conventional resource requests and preserve action feedback", async (t) => {
  const cases = [
    [{ intent: "save_journal", date: "2026-11-21", journal: "" },
      "/api/journals/2026-11-21", "PUT", { content: "" }, { date: "2026-11-21", content: "" },
      { ok: true, message: "Journal saved." }],
    [{ intent: "toggle_builtin", date: "2026-11-21", taskId: "12", completed: "false" },
      "/api/routines/12/completions/2026-11-21", "PUT", { completed: false }, { earnedAchievements: [] },
      { ok: true, earnedAchievements: [] }],
    [{ intent: "toggle_physical_therapy", date: "2026-11-21", sessionId: "am", exerciseId: "glute", completed: "true" },
      "/api/therapy/sessions/am/exercises/glute/completions/2026-11-21", "PUT", { completed: true },
      { earnedAchievements: ["Milestone"] }, { ok: true, earnedAchievements: ["Milestone"] }],
    [{ intent: "toggle_external", date: "2026-11-21", source: "gmail", externalId: "a/b?c#d", completed: "true" },
      "/api/external-tasks/gmail/a%2Fb%3Fc%23d/completion", "PUT", { date: "2026-11-21", completed: true },
      { completed: true }, { ok: true }],
    [{ intent: "update_routine_kind", taskId: "12", kind: "main" },
      "/api/routines/12", "PATCH", { kind: "main" }, { id: 12, kind: "main" },
      { ok: true, message: "Moved to main (50 pts)." }],
  ];
  const fetch = t.mock.method(globalThis, "fetch");
  for (const [fields, path, method, body, response, expected] of cases) {
    const controller = new AbortController();
    const actionRequest = new Request("http://localhost/", {
      method: "POST", body: new URLSearchParams(fields), signal: controller.signal,
    });
    fetch.mock.mockImplementation(async (url, options) => {
      assert.equal(url, path);
      assert.equal(options.method, method);
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), body);
      assert.equal(options.signal, actionRequest.signal);
      return Response.json(response);
    });
    assert.deepEqual(await plannerAction({ request: actionRequest }), expected);
  }
});

test("resource actions report server errors without retrying the legacy API", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "That planner task is invalid." }, { status: 404 }));
  const fields = { intent: "toggle_builtin", taskId: "12", date: "2026-11-21", completed: "true" };
  const submit = (values) => plannerAction({ request: new Request("http://localhost/", {
    method: "POST", body: new URLSearchParams(values),
  }) });
  assert.deepEqual(await submit(fields), { ok: false, error: "That planner task is invalid." });
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(await submit({ ...fields, completed: "yes" }), { ok: false, error: "That task state is invalid." });
  assert.equal(fetch.mock.callCount(), 1);
  fetch.mock.mockImplementation(async () => new Response("Service unavailable", { status: 503 }));
  assert.deepEqual(await submit(fields), { ok: false, error: "Could not submit the planner action (503)." });
  const controller = new AbortController();
  controller.abort();
  fetch.mock.mockImplementation(async () => { throw new DOMException("Aborted", "AbortError"); });
  await assert.rejects(plannerAction({ request: new Request("http://localhost/", {
    method: "POST", body: new URLSearchParams(fields), signal: controller.signal,
  }) }), { name: "AbortError" });
});
