import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { resetTestDatabase } from "../scripts/reset-test-database.mjs";

const testUrl = "postgresql://tester:example@localhost:5432/cyberplanner_test";
const appUrl = "postgresql://app:example@localhost:5432/cyberplanner";

test("reset rejects missing, non-test, and app database targets before connecting", async (t) => {
  const client = t.mock.method(pg, "Client", () => {
    throw new Error("Must not connect.");
  });
  await assert.rejects(resetTestDatabase(undefined, appUrl), /Set both/);
  await assert.rejects(resetTestDatabase(testUrl, undefined), /Set both/);
  await assert.rejects(resetTestDatabase("not a URL", appUrl), /valid PostgreSQL/);
  await assert.rejects(resetTestDatabase(appUrl, appUrl), /ending in _test/);
  await assert.rejects(resetTestDatabase(testUrl, testUrl.replace("localhost", "127.0.0.1")), /same name/);
  assert.equal(client.mock.callCount(), 0);
});

test("reset recreates only public in a transaction and closes the connection", async (t) => {
  const queries = [];
  let closed = false;
  t.mock.method(pg, "Client", function () {
    return {
      async connect() {},
      async query(sql) {
        queries.push(sql);
        return { rows: [{ name: "cyberplanner_test", schema: "public", owned: true }] };
      },
      async end() { closed = true; },
    };
  });
  await resetTestDatabase(testUrl, appUrl);
  assert.deepEqual(queries.slice(1), [
    "BEGIN", "DROP SCHEMA public CASCADE", "CREATE SCHEMA public AUTHORIZATION CURRENT_USER", "COMMIT",
  ]);
  assert.equal(closed, true);
});

test("reset refuses unexpected database, schema, or ownership without dropping anything", async (t) => {
  const client = t.mock.method(pg, "Client");
  for (const database of [
    { name: "cyberplanner", schema: "public", owned: true },
    { name: "cyberplanner_test", schema: "custom", owned: true },
    { name: "cyberplanner_test", schema: "public", owned: false },
  ]) {
    const queries = [];
    let closed = false;
    client.mock.mockImplementation(function () {
      return {
        async connect() {},
        async query(sql) {
          queries.push(sql);
          return { rows: [database] };
        },
        async end() { closed = true; },
      };
    });
    await assert.rejects(resetTestDatabase(testUrl, appUrl), /must own/);
    assert.equal(queries.length, 1);
    assert.equal(closed, true);
  }
});

test("reset rolls back and reports schema recreation failures", async (t) => {
  const queries = [];
  let closed = false;
  t.mock.method(pg, "Client", function () {
    return {
      async connect() {},
      async query(sql) {
        queries.push(sql);
        if (sql.startsWith("CREATE SCHEMA")) throw new Error("Schema recreation failed.");
        return { rows: [{ name: "cyberplanner_test", schema: "public", owned: true }] };
      },
      async end() { closed = true; },
    };
  });
  await assert.rejects(resetTestDatabase(testUrl, appUrl), /Schema recreation failed/);
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.ok(!queries.includes("COMMIT"));
  assert.equal(closed, true);
});
