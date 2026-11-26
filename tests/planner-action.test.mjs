import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryRouter } from "react-router";
import {
  externalCompletionAction, routineCompletionAction, updateRoutineAction,
} from "../src/features/planner/services/routine-actions.ts";
import {
  therapyCompletionAction, therapyLoader,
} from "../src/features/therapy/services/therapy-route.ts";
import {
  createJournalAction, journalLoader, journalResourceAction,
} from "../src/features/planner/services/journal-actions.ts";
import {
  calendarLoader, createCalendarEventAction, gmailMessagesLoader, importGmailAction,
  syncGoogleTasksAction, updateCalendarEventAction,
} from "../src/features/calendar/services/google-actions.ts";
import {
  bookDetailsLoader, bookmarksLoader, booksLoader, chaptersLoader, createBookmarkAction,
  deleteBookmarkAction, renameBookAction, saveBookDetailsAction,
} from "../src/features/books/services/book-actions.ts";
import {
  acceptQuestTemplateAction,
  completeQuestAction,
  createQuestAction,
  deleteQuestAction,
  questResourceAction,
  updateQuestAction,
} from "../src/features/planner/services/quest-actions.ts";
import {
  createAchievementAction,
  redeemRewardAction,
} from "../src/features/planner/services/gamification-actions.ts";

test("routine and completion forms use URL identities, HTTP methods and milestone feedback", async (t) => {
  const cases = [
    [routineCompletionAction, { id: "12", date: "2026-11-21" }, { completed: "false" },
      "/api/routines/12/completions/2026-11-21", "PUT", { completed: false }, { earnedAchievements: [] },
      { status: 200, earnedAchievements: [] }],
    [therapyCompletionAction, { date: "2026-11-21", sessionId: "am", exerciseId: "glute" }, { completed: "true" },
      "/api/therapy/sessions/am/exercises/glute/completions/2026-11-21", "PUT", { completed: true },
      { earnedAchievements: ["Milestone"] }, { status: 200, earnedAchievements: ["Milestone"] }],
    [externalCompletionAction, { date: "2026-11-21", source: "gmail", id: "a/b?c#d" }, { completed: "true" },
      "/api/external-tasks/gmail/a%2Fb%3Fc%23d/completion", "PUT", { date: "2026-11-21", completed: true },
      { completed: true }, { status: 200 }],
    [updateRoutineAction, { id: "12" }, { kind: "main" },
      "/api/routines/12", "PATCH", { kind: "main" }, { id: 12, kind: "main" },
      { status: 200, message: "Moved to main (50 pts)." }],
  ];
  const fetch = t.mock.method(globalThis, "fetch");
  for (const [action, params, fields, path, method, body, response, expected] of cases) {
    const controller = new AbortController();
    const actionRequest = new Request("http://localhost/", {
      method, body: new URLSearchParams(fields), signal: controller.signal,
    });
    fetch.mock.mockImplementation(async (url, options) => {
      assert.equal(url, path);
      assert.equal(options.method, method);
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), body);
      assert.equal(options.signal, actionRequest.signal);
      return Response.json(response);
    });
    assert.deepEqual(await action({ request: actionRequest, params }), expected);
  }
});

test("therapy loader reads only the selected date resource", async (t) => {
  const plan = { therapySessions: [], earnedPoints: 20 };
  const controller = new AbortController();
  const request = new Request("http://localhost/physical-therapy?date=2026-11-21", {
    signal: controller.signal,
  });
  const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "/api/therapy/sessions?date=2026-11-21");
    assert.equal(options.signal, request.signal);
    return Response.json(plan);
  });
  const result = await therapyLoader({
    request,
    params: {},
  });
  assert.deepEqual(result, plan);
  assert.equal(fetch.mock.callCount(), 1);
});

test("therapy loader uses planner date fallback and propagates request failures", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (url) => {
    const requested = new URL(url, "http://localhost").searchParams.get("date");
    assert.match(requested, /^\d{4}-\d{2}-\d{2}$/);
    return Response.json({ error: "Unavailable." }, { status: 503 });
  });
  await assert.rejects(therapyLoader({
    request: new Request("http://localhost/physical-therapy?date=2026-02-30"),
    params: {},
  }), /Could not load therapy sessions \(503\)/);
  fetch.mock.mockImplementation(async () => { throw new Error("Network unavailable"); });
  await assert.rejects(therapyLoader({
    request: new Request("http://localhost/physical-therapy"),
    params: {},
  }), { message: "Network unavailable" });
});

test("resource actions report server errors without retrying the legacy API", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "That planner task is invalid." }, { status: 404 }));
  const fields = { completed: "true" };
  const submit = (values) => routineCompletionAction({ request: new Request("http://localhost/routines/12/completions/2026-11-21", {
    method: "PUT", body: new URLSearchParams(values),
  }), params: { id: "12", date: "2026-11-21" } });
  assert.deepEqual(await submit(fields), { status: 404, error: "That planner task is invalid." });
  assert.equal(fetch.mock.callCount(), 1);
  fetch.mock.mockImplementation(async () => new Response("Service unavailable", { status: 503 }));
  await assert.rejects(submit(fields), SyntaxError);
  const controller = new AbortController();
  controller.abort();
  fetch.mock.mockImplementation(async () => { throw new DOMException("Aborted", "AbortError"); });
  await assert.rejects(routineCompletionAction({ request: new Request("http://localhost/routines/12/completions/2026-11-21", {
    method: "PUT", body: new URLSearchParams(fields), signal: controller.signal,
  }), params: { id: "12", date: "2026-11-21" } }), { name: "AbortError" });
});

test("achievement and reward writes use resource URLs and statuses", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url === "/api/achievements") {
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), {
        title: "Water goal",
        description: "Drink water",
        category: "Daily & Routine",
        tier: "Common",
        xp: 25,
        target: 7,
        tracking: "streak",
        taskId: "3",
        reward: "A treat",
      });
      return Response.json({ achievement: { id: "water" }, earnedAchievements: ["Water goal"] }, { status: 201 });
    }
    assert.equal(url, "/api/rewards/snacks/redemptions");
    assert.equal(options.method, "POST");
    assert.equal(options.body, undefined);
    return Response.json({ rewardId: "snacks", balance: 10 }, { status: 201 });
  });
  const achievementRequest = new Request("http://localhost/profile/achievements", {
    method: "POST",
    body: new URLSearchParams({
      title: "Water goal",
      description: "Drink water",
      category: "Daily & Routine",
      tier: "Common",
      xp: "25",
      target: "7",
      tracking: "streak",
      taskId: "3",
      reward: "A treat",
    }),
  });
  assert.deepEqual(await createAchievementAction({ request: achievementRequest, params: {} }), {
    status: 201,
    message: "Achievement created.",
    earnedAchievements: ["Water goal"],
  });
  assert.deepEqual(await redeemRewardAction({
    request: new Request("http://localhost/rewards/snacks/redemptions", { method: "POST" }),
    params: { id: "snacks" },
  }), { status: 201, message: "Reward redeemed." });
});

test("achievement and reward actions report API errors", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "Rejected." }, { status: 409 }));
  assert.deepEqual(await createAchievementAction({
    request: new Request("http://localhost/profile/achievements", {
      method: "POST",
      body: new URLSearchParams(),
    }),
    params: {},
  }), { status: 409, error: "Rejected." });
  assert.deepEqual(await redeemRewardAction({
    request: new Request("http://localhost/rewards/snacks/redemptions", { method: "POST" }),
    params: { id: "snacks" },
  }), { status: 409, error: "Rejected." });
  assert.equal(fetch.mock.callCount(), 2);
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

test("shared quest and journal item actions reject unsupported methods without making API requests", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch");
  for (const [action, method] of [
    [questResourceAction, "POST"],
    [questResourceAction, "PUT"],
    [journalResourceAction, "POST"],
    [journalResourceAction, "PATCH"],
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

test("journal actions create empty entries and route saves and deletes on the same date URL", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push([url, options.method, options.body && JSON.parse(options.body)]);
    return new Response(null, { status: options.method === "DELETE" ? 204 : options.method === "POST" ? 201 : 200 });
  });
  const router = createMemoryRouter([
    { id: "create", path: "/journal/entries", action: createJournalAction },
    { id: "entry", path: "/journal/entries/:date", action: journalResourceAction },
  ], { initialEntries: ["/journal/entries"] });
  try {
    const form = new FormData();
    form.set("date", "2026-11-21");
    form.set("content", "");
    await router.navigate("/journal/entries", { formMethod: "post", formData: form });
    assert.equal(router.state.actionData.create.status, 201);
    form.delete("date");
    form.set("content", "Saved draft");
    await router.navigate("/journal/entries/2026-11-21", { formMethod: "put", formData: form });
    assert.equal(router.state.actionData.entry.status, 200);
    await router.navigate("/journal/entries/2026-11-21", { formMethod: "delete", formData: new FormData() });
    assert.equal(router.state.actionData.entry.status, 204);
    assert.deepEqual(calls, [
      ["/api/journals", "POST", { date: "2026-11-21", content: "" }],
      ["/api/journals/2026-11-21", "PUT", { content: "Saved draft" }],
      ["/api/journals/2026-11-21", "DELETE", undefined],
    ]);
  } finally {
    router.dispose();
  }
});

test("journal resource reads distinguish missing entries, empty entries and API errors", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.signal, request.signal);
    return url === "/api/journals"
      ? Response.json([{ date: "2026-11-21" }])
      : Response.json({ error: "Not found." }, { status: 404 });
  });
  const request = new Request("http://localhost/journal/entries/2026-11-21");
  const args = { request, params: { date: "2026-11-21" } };
  assert.deepEqual(await journalLoader(args), {
    status: 200, dates: ["2026-11-21"], entry: { date: "2026-11-21", content: "", exists: false },
  });
  fetch.mock.mockImplementation(async (url) => url === "/api/journals"
    ? Response.json([{ date: "2026-11-21" }])
    : Response.json({ content: "" }));
  assert.equal((await journalLoader(args)).entry.exists, true);
  fetch.mock.mockImplementation(async () => Response.json({ error: "Sign in first." }, { status: 401 }));
  assert.deepEqual(await journalLoader(args), { status: 401, error: "Sign in first." });
});

test("Google and calendar actions keep normalized fields and resource identities separate", async (t) => {
  const event = {
    title: "Meeting", start: "2026-11-21T15:00:00.000Z", end: "2026-11-21T16:00:00.000Z",
    allDay: "false", etag: '"etag"', startTimeZone: "America/Chicago", endTimeZone: "America/Chicago",
  };
  const cases = [
    [syncGoogleTasksAction, { date: "2026-11-21" }, {}, "/api/google/tasks/sync/2026-11-21", "POST", undefined],
    [importGmailAction, { id: "mail/1", date: "2026-11-21" }, {}, "/api/google/gmail/messages/mail%2F1/tasks/2026-11-21", "POST", undefined],
    [createCalendarEventAction, { calendarId: "cal/1" }, event, "/api/calendar/cal%2F1/events", "POST",
      { ...event, allDay: false, etag: "" }],
    [updateCalendarEventAction, { calendarId: "cal/1", id: "instance/1" }, event, "/api/calendar/cal%2F1/events/instance%2F1", "PATCH",
      { ...event, allDay: false }],
  ];
  const fetch = t.mock.method(globalThis, "fetch");
  for (const [action, params, fields, path, method, body] of cases) {
    const request = new Request("http://localhost/calendar", { method, body: new URLSearchParams(fields) });
    fetch.mock.mockImplementation(async (url, options) => {
      assert.equal(url, path);
      assert.equal(options.method, method);
      assert.deepEqual(options.body && JSON.parse(options.body), body);
      assert.equal(options.signal, request.signal);
      return Response.json({ message: "Saved." }, { status: 201 });
    });
    assert.deepEqual(await action({ request, params }), { status: 201, message: "Saved." });
  }
});

test("book actions preserve existing APIs and use URL parameters rather than hidden identities", async (t) => {
  const details = { url: "https://en.wikipedia.org/wiki/Example", description: "Article", image: null };
  const params = { library: "ebooks", path: "Shelf/a?b#c.epub", id: "mark/1" };
  const cases = [
    [renameBookAction, { title: "New title" }, "/api/books/rename", "POST",
      { library: params.library, path: params.path, title: "New title" }, { id: "book/1", title: "New title" },
      { status: 200, book: { id: "book/1", title: "New title" } }],
    [saveBookDetailsAction, { details: JSON.stringify(details), cover: "null" }, "/api/books/details", "POST",
      { library: params.library, path: params.path, details, cover: null }, { ok: true },
      { status: 200, wiki: details }],
    [createBookmarkAction, { position: "epubcfi(/6/2)", label: "Bookmark" }, "/api/books/bookmarks", "POST",
      { library: params.library, path: params.path, position: "epubcfi(/6/2)", label: "Bookmark" }, { id: "mark/1" },
      { status: 200, message: "Bookmark saved." }],
    [deleteBookmarkAction, {}, "/api/books/bookmarks?library=ebooks&path=Shelf%2Fa%3Fb%23c.epub&id=mark%2F1", "DELETE",
      undefined, null, { status: 204, message: "Bookmark removed." }],
  ];
  const fetch = t.mock.method(globalThis, "fetch");
  for (const [action, fields, path, method, body, result, expected] of cases) {
    const request = new Request("http://localhost/books", { method, body: new URLSearchParams(fields) });
    fetch.mock.mockImplementation(async (url, options) => {
      assert.equal(url, path);
      assert.equal(options.method, method);
      assert.deepEqual(options.body && JSON.parse(options.body), body);
      assert.equal(options.signal, request.signal);
      return result === null ? new Response(null, { status: 204 }) : Response.json(result);
    });
    assert.deepEqual(await action({ request, params }), expected);
  }
});

test("new resource actions return API errors and propagate failures", async (t) => {
  const cases = [
    [createJournalAction, "POST", { date: "2026-11-21", content: "" }],
    [journalResourceAction, "PUT", { content: "Draft" }],
    [journalResourceAction, "DELETE", {}],
    [routineCompletionAction, "PUT", { completed: "true" }],
    [therapyCompletionAction, "PUT", { completed: "false" }],
    [externalCompletionAction, "PUT", { completed: "true" }],
    [updateRoutineAction, "PATCH", { kind: "main" }],
    [createAchievementAction, "POST", { tracking: "points" }],
    [redeemRewardAction, "POST", {}],
    [syncGoogleTasksAction, "POST", {}],
    [importGmailAction, "POST", {}],
    [createCalendarEventAction, "POST", { allDay: "false" }],
    [updateCalendarEventAction, "PATCH", { allDay: "false" }],
    [renameBookAction, "POST", { title: "New title" }],
    [saveBookDetailsAction, "POST", { details: JSON.stringify({ image: null }), cover: "null" }],
    [createBookmarkAction, "POST", { position: "epubcfi(/6/2)", label: "Bookmark" }],
    [deleteBookmarkAction, "DELETE", {}],
  ];
  const fetch = t.mock.method(globalThis, "fetch");
  const params = { id: "1", date: "2026-11-21", source: "gmail", sessionId: "am", exerciseId: "glute", calendarId: "cal", library: "ebooks", path: "A.epub" };
  for (const [action, method, fields] of cases) {
    const submit = (signal) => action({
      request: new Request("http://localhost/resource", { method, body: new URLSearchParams(fields), signal }), params,
    });
    fetch.mock.mockImplementation(async () => Response.json({ error: "Rejected." }, { status: 409 }));
    assert.deepEqual(await submit(), { status: 409, error: "Rejected." });
    fetch.mock.mockImplementation(async () => new Response("Unexpected response", { status: 502 }));
    await assert.rejects(submit(), SyntaxError);
    fetch.mock.mockImplementation(async () => { throw new Error("Network unavailable"); });
    await assert.rejects(submit(), /Network unavailable/);
    const controller = new AbortController();
    fetch.mock.mockImplementation(async (_url, options) => {
      assert.equal(options.signal.aborted, false);
      controller.abort();
      assert.equal(options.signal.aborted, true);
      throw new DOMException("Aborted", "AbortError");
    });
    await assert.rejects(submit(controller.signal), { name: "AbortError" });
  }
});

test("resource loaders forward query values, API errors and cancellation", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch");
  for (const [loader, url, params, api] of [
    [gmailMessagesLoader, "http://localhost/google/gmail/messages?query=in%3Ainbox", {}, "/api/google/gmail/messages?query=in%3Ainbox"],
    [calendarLoader, "http://localhost/calendar/events?start=a&end=b", {}, "/api/calendar?start=a&end=b"],
    [booksLoader, "http://localhost/books/collection", {}, "/api/books"],
    [bookDetailsLoader, "http://localhost/books/ebooks/A.epub/details", { library: "ebooks", path: "A.epub" }, "/api/books/details?library=ebooks&path=A.epub"],
    [bookmarksLoader, "http://localhost/books/ebooks/A.epub/bookmarks", { library: "ebooks", path: "A.epub" }, "/api/books/bookmarks?library=ebooks&path=A.epub"],
    [chaptersLoader, "http://localhost/books/audiblebooks/A.m4b/chapters", { library: "audiblebooks", path: "A.m4b" }, "/api/books/chapters?library=audiblebooks&path=A.m4b"],
  ]) {
    const request = new Request(url);
    fetch.mock.mockImplementation(async (path, options) => {
      assert.equal(path, api);
      assert.equal(options.signal, request.signal);
      return Response.json({ error: "Sign in first." }, { status: 401 });
    });
    assert.deepEqual(await loader({ request, params }), {
      status: 401, error: "Sign in first.",
      ...(loader === calendarLoader ? { range: "?start=a&end=b" } : {}),
    });
    fetch.mock.mockImplementation(async () => { throw new DOMException("Aborted", "AbortError"); });
    await assert.rejects(loader({ request, params }), { name: "AbortError" });
  }
});

test("React Router decodes encoded book path parameters without reading hidden identity fields", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "/api/books/rename");
    assert.deepEqual(JSON.parse(options.body), { library: "ebooks", path: "Shelf/a?b#c.epub", title: "New title" });
    return Response.json({ id: "book", title: "New title" });
  });
  const path = `/books/ebooks/${encodeURIComponent("Shelf/a?b#c.epub")}/rename`;
  const router = createMemoryRouter([{
    id: "rename", path: "/books/:library/:path/rename", action: renameBookAction,
  }], { initialEntries: [path] });
  try {
    const form = new FormData();
    form.set("title", "New title");
    await router.navigate(path, { formMethod: "post", formData: form });
    assert.deepEqual(router.state.actionData.rename.book, { id: "book", title: "New title" });
  } finally {
    router.dispose();
  }
});

test("resource loaders retain nullable book metadata and the requested calendar range", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json(null));
  assert.deepEqual(await bookDetailsLoader({
    request: new Request("http://localhost/books/ebooks/A.epub/details"), params: { library: "ebooks", path: "A.epub" },
  }), { status: 200, wiki: null });
  const data = { calendars: [], events: [], unavailableCalendars: [] };
  fetch.mock.mockImplementation(async () => Response.json(data));
  assert.deepEqual(await calendarLoader({
    request: new Request("http://localhost/calendar/events?start=a&end=b"), params: {},
  }), { status: 200, range: "?start=a&end=b", data });
});
