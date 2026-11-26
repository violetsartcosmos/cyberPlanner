import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryRouter } from "react-router";
import { plannerAction } from "../src/features/planner/services/planner-route.ts";
import {
  acceptQuestTemplateAction,
  completeQuestAction,
  createQuestAction,
  deleteQuestAction,
  questResourceAction,
  updateQuestAction,
} from "../src/features/planner/services/quest-actions.ts";

function request(signal) {
  return new Request("http://localhost/profile", {
    method: "POST",
    body: new URLSearchParams({ intent: "save_achievement" }),
    signal,
  });
}

test("planner action returns HTTP errors and lets request failures propagate", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
  assert.deepEqual(await plannerAction({ request: request() }), {
    ok: false, error: "Could not submit the planner action (503).",
  });
  fetch.mock.mockImplementation(async () => { throw new Error("Network unavailable"); });
  await assert.rejects(plannerAction({ request: request() }), { message: "Network unavailable" });
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
  await assert.rejects(submit(fields), SyntaxError);
  const controller = new AbortController();
  controller.abort();
  fetch.mock.mockImplementation(async () => { throw new DOMException("Aborted", "AbortError"); });
  await assert.rejects(plannerAction({ request: new Request("http://localhost/", {
    method: "POST", body: new URLSearchParams(fields), signal: controller.signal,
  }) }), { name: "AbortError" });
});

test("quest actions use resource URLs, HTTP methods, and statuses without form intents", async (t) => {
  const cases = [
    [createQuestAction, {}, { title: "Learn", description: "", kind: "main", tier: "Rare", points: "50" },
      "/api/quests", "POST", { title: "Learn", description: "", kind: "main", tier: "Rare", points: 50 },
      { status: 201, message: "Quest created." }],
    [questResourceAction, { id: "quest/1" }, { title: "Learn more", description: "Practice", kind: "boss", tier: "Epic", points: "75" },
      "/api/quests/quest%2F1", "PATCH", { title: "Learn more", description: "Practice", kind: "boss", tier: "Epic", points: 75 },
      { status: 200, message: "Quest updated." }],
    [completeQuestAction, { id: "quest/1" }, {},
      "/api/quests/quest%2F1/complete", "POST", undefined,
      { status: 200, message: "Quest complete! Points and XP earned." }],
    [questResourceAction, { id: "quest/1" }, {},
      "/api/quests/quest%2F1", "DELETE", undefined,
      { status: 204, message: "Quest deleted. Earned points and XP are kept." }],
  ];
  const fetch = t.mock.method(globalThis, "fetch");
  for (const [action, params, fields, path, method, body, expected] of cases) {
    const actionRequest = new Request("http://localhost/quest-board", {
      method, body: new URLSearchParams(fields),
    });
    fetch.mock.mockImplementation(async (url, options) => {
      assert.equal(url, path);
      assert.equal(options.method, method);
      if (body === undefined) {
        assert.equal(options.body, undefined);
      } else {
        assert.equal(options.headers["Content-Type"], "application/json");
        assert.deepEqual(JSON.parse(options.body), body);
      }
      assert.equal(options.signal, actionRequest.signal);
      return method === "DELETE"
        ? new Response(null, { status: 204 })
        : Response.json({ id: "quest/1" }, { status: expected.status });
    });
    assert.deepEqual(await action({ request: actionRequest, params }), expected);
  }
});

test("quest log accepts templates and shows resource errors", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "/api/quest-templates/template%2F1/accept");
    assert.equal(options.method, "POST");
    return Response.json({ error: "That quest is already in your quest list." }, { status: 409 });
  });
  const actionRequest = new Request("http://localhost/quest-log", {
    method: "POST",
  });
  assert.deepEqual(await acceptQuestTemplateAction({ request: actionRequest, params: { templateId: "template/1" } }), {
    status: 409,
    error: "That quest is already in your quest list.",
  });
  assert.equal(fetch.mock.callCount(), 1);
  fetch.mock.mockImplementation(async () => Response.json({ ok: true }, { status: 201 }));
  assert.deepEqual(await acceptQuestTemplateAction({ request: new Request("http://localhost/quest-log", {
    method: "POST",
  }), params: { templateId: "template/1" } }), {
    status: 201,
    message: "Quest accepted. It now appears on Create Quest.",
  });
});

test("individual quest actions return API errors and propagate unexpected failures", async (t) => {
  const cases = [
    [createQuestAction, {}, { title: "Learn", description: "", kind: "main", tier: "Rare", points: "50" }, "POST"],
    [updateQuestAction, { id: "1" }, { title: "Learn", description: "", kind: "main", tier: "Rare", points: "50" }, "PATCH"],
    [deleteQuestAction, { id: "1" }, {}, "DELETE"],
    [completeQuestAction, { id: "1" }, {}, "POST"],
    [acceptQuestTemplateAction, { templateId: "1" }, {}, "POST"],
  ];
  const fetch = t.mock.method(globalThis, "fetch");
  for (const [action, params, fields, method] of cases) {
    const submit = (signal) => action({ request: new Request("http://localhost/quest-board", {
      method, body: new URLSearchParams(fields), signal,
    }), params });
    fetch.mock.mockImplementation(async () => Response.json({ error: "Rejected." }, { status: 409 }));
    assert.deepEqual(await submit(), { status: 409, error: "Rejected." });

    fetch.mock.mockImplementation(async () => new Response("Service unavailable", { status: 503 }));
    await assert.rejects(submit(), SyntaxError);

    fetch.mock.mockImplementation(async () => { throw new Error("Network unavailable"); });
    await assert.rejects(submit(), { message: "Network unavailable" });

    const controller = new AbortController();
    fetch.mock.mockImplementation(async () => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    });
    await assert.rejects(submit(controller.signal), { name: "AbortError" });
  }
  assert.equal(fetch.mock.callCount(), cases.length * 4);
});

test("React Router sends request failures to the route error boundary", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Network unavailable"); });
  const router = createMemoryRouter([{
    id: "quest-create",
    path: "/quest-board",
    action: createQuestAction,
    errorElement: "Request failed",
  }], { initialEntries: ["/quest-board"] });
  try {
    await router.navigate("/quest-board", {
      formMethod: "post",
      formData: new FormData(),
    });
    assert.equal(router.state.errors["quest-create"].message, "Network unavailable");
  } finally {
    router.dispose();
  }
});

test("quest routes reject unsupported methods without making API requests", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch");
  for (const [action, method] of [
    [createQuestAction, "DELETE"],
    [questResourceAction, "POST"],
    [questResourceAction, "PUT"],
    [completeQuestAction, "DELETE"],
    [acceptQuestTemplateAction, "PATCH"],
  ]) {
    assert.deepEqual(await action({
      request: new Request("http://localhost/quest-board/1", { method }),
      params: { id: "1", templateId: "1" },
    }), { status: 405, error: "Method not allowed." });
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("React Router routes PATCH and DELETE on the same quest item URL", async (t) => {
  const methods = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "/api/quests/quest%2F1");
    methods.push(options.method);
    return options.method === "DELETE"
      ? new Response(null, { status: 204 })
      : Response.json({ id: "quest/1" });
  });
  const router = createMemoryRouter([{
    id: "quest",
    path: "/quest-board/:id",
    action: questResourceAction,
  }], { initialEntries: ["/quest-board/quest%2F1"] });
  try {
    await router.navigate("/quest-board/quest%2F1", {
      formMethod: "patch",
      formData: new FormData(),
    });
    assert.equal(router.state.actionData.quest.status, 200);
    await router.navigate("/quest-board/quest%2F1", {
      formMethod: "delete",
      formData: new FormData(),
    });
    assert.equal(router.state.actionData.quest.status, 204);
    assert.deepEqual(methods, ["PATCH", "DELETE"]);
  } finally {
    router.dispose();
  }
});
