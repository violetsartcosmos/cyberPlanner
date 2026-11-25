import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

test("routine ID migration preserves checks, awards, and streak references", async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL must point to a disposable PostgreSQL database.");
  const client = new pg.Client({ connectionString: url });
  const schema = `routine_migration_${randomUUID().replaceAll("-", "")}`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    const root = new URL("../prisma/migrations/", import.meta.url);
    const folders = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const current = "20261128000000_routine_task_integer_ids";
    for (const folder of folders.filter((name) => name < current)) {
      await client.query(await readFile(new URL(`${folder}/migration.sql`, root), "utf8"));
    }

    await client.query(`
      INSERT INTO planner_days (day, checks) VALUES
        ('2026-11-23', '["morning-2","daily-0","unknown"]'),
        ('2026-11-24', '["daily-0"]');
      INSERT INTO point_ledger (amount, entry_type, task_key, task_date) VALUES
        (10, 'earn', 'builtin:2026-11-23:morning-2', '2026-11-23'),
        (10, 'earn', 'builtin:2026-11-23:daily-0', '2026-11-23'),
        (10, 'earn', 'builtin:2026-11-24:daily-0', '2026-11-24'),
        (10, 'earn', 'builtin:2026-11-23:unknown', '2026-11-23');
    `);
    const migration = await readFile(new URL(`${current}/migration.sql`, root), "utf8");

    await client.query("UPDATE achievements SET task_id = 'morning-999' WHERE id = 'water'");
    await assert.rejects(client.query(migration), /unknown routine task ID/);
    await client.query("ROLLBACK");
    await client.query("UPDATE achievements SET task_id = 'morning-2' WHERE id = 'water'");
    await client.query(migration);

    const routines = await client.query(`
      SELECT id, list, weekday, title FROM routine_tasks
      WHERE (list = 'morning' AND title = 'Water')
         OR (list = 'daily' AND weekday IN (0, 1)
             AND title IN ('Take out trash', 'Wash clothes'))
    `);
    const findId = (title) => String(routines.rows.find((row) => row.title === title).id);
    const water = findId("Water");
    const monday = findId("Take out trash");
    const tuesday = findId("Wash clothes");
    assert.notEqual(monday, tuesday);

    const days = await client.query("SELECT day::text, checks FROM planner_days ORDER BY day");
    assert.deepEqual(days.rows.map((row) => row.checks), [
      [water, monday, "unknown"], [tuesday],
    ]);
    const ledger = await client.query("SELECT task_key FROM point_ledger ORDER BY id");
    assert.deepEqual(ledger.rows.map((row) => row.task_key), [
      `builtin:2026-11-23:${water}`,
      `builtin:2026-11-23:${monday}`,
      `builtin:2026-11-24:${tuesday}`,
      "builtin:2026-11-23:unknown",
    ]);
    const achievement = await client.query("SELECT task_id FROM achievements WHERE id = 'water'");
    assert.equal(achievement.rows[0].task_id, water);
    const duplicate = await client.query(`
      INSERT INTO point_ledger (amount, entry_type, task_key, task_date)
      VALUES (10, 'earn', $1, '2026-11-23')
      ON CONFLICT DO NOTHING RETURNING id
    `, [`builtin:2026-11-23:${water}`]);
    assert.equal(duplicate.rowCount, 0);
    const newRoutine = await client.query(`
      INSERT INTO routine_tasks (list, weekday, title, kind, points)
      VALUES ('morning', -1, 'New task', 'side', 10)
      RETURNING id
    `);
    assert.ok(newRoutine.rows[0].id > Number(water));

    const weekdayMigration = await readFile(
      new URL("20261129000000_named_routine_weekdays/migration.sql", root), "utf8",
    );
    await client.query(`
      INSERT INTO routine_tasks (list, weekday, title, kind, points)
      VALUES ('daily', 7, 'Invalid weekday', 'side', 10)
    `);
    await assert.rejects(client.query(weekdayMigration), /invalid routine weekday/);
    await client.query("ROLLBACK");
    await client.query("DELETE FROM routine_tasks WHERE title = 'Invalid weekday'");
    await client.query(weekdayMigration);

    const migrated = await client.query(`
      SELECT id, weekday FROM routine_tasks WHERE id IN ($1, $2, $3) ORDER BY id
    `, [Number(water), Number(monday), Number(tuesday)]);
    const weekdaysById = new Map(migrated.rows.map((row) => [String(row.id), row.weekday]));
    assert.equal(weekdaysById.get(water), null);
    assert.equal(weekdaysById.get(monday), "monday");
    assert.equal(weekdaysById.get(tuesday), "tuesday");
    const groups = await client.query("SELECT weekday FROM routine_groups ORDER BY weekday");
    assert.deepEqual(groups.rows.map((row) => row.weekday), [
      "friday", "monday", "saturday", "sunday", "thursday", "tuesday", "wednesday",
    ]);
    assert.deepEqual((await client.query("SELECT checks FROM planner_days ORDER BY day")).rows.map((row) => row.checks), [
      [water, monday, "unknown"], [tuesday],
    ]);
    assert.equal((await client.query("SELECT task_id FROM achievements WHERE id = 'water'")).rows[0].task_id, water);
    assert.deepEqual((await client.query("SELECT task_key FROM point_ledger ORDER BY id")).rows.map((row) => row.task_key), [
      `builtin:2026-11-23:${water}`, `builtin:2026-11-23:${monday}`,
      `builtin:2026-11-24:${tuesday}`, "builtin:2026-11-23:unknown",
    ]);
    await assert.rejects(client.query(`
      INSERT INTO routine_tasks (list, weekday, title, kind, points)
      VALUES ('daily', NULL, 'Missing weekday', 'side', 10)
    `), /routine_tasks_weekday_check/);
    await assert.rejects(client.query(`
      INSERT INTO routine_tasks (list, weekday, title, kind, points)
      VALUES ('morning', 'monday', 'Invalid schedule', 'side', 10)
    `), /routine_tasks_weekday_check/);
  } finally {
    await client.query("ROLLBACK");
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});
