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
