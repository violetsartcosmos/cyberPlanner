import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import pg from "pg";
import { createCookieSessionStorage } from "react-router";
import { createServer } from "vite";

test("Prisma preserves planner, points, and Google database behavior", async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL must point to an empty, disposable PostgreSQL database.");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const tables = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = current_schema()",
    );
    if (tables.rowCount !== 0) {
      throw new Error("TEST_DATABASE_URL must point to an empty database; no changes were made.");
    }

    process.env.DATABASE_URL = url;
    process.env.SESSION_SECRET = "temporary-integration-test-session-secret";
    process.env.GOOGLE_ALLOWED_EMAIL = "integration@example.test";
    const migration = spawnSync(process.execPath, [
      "node_modules/prisma/build/index.js", "migrate", "deploy",
    ], { env: process.env, encoding: "utf8" });
    assert.equal(migration.status, 0, migration.stderr || migration.stdout);
    const diff = spawnSync(process.execPath, [
      "node_modules/prisma/build/index.js", "migrate", "diff",
      "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code",
    ], { env: process.env, encoding: "utf8" });
    assert.equal(diff.status, 0, `${diff.stderr}\n${diff.stdout}`);

    const vite = await createServer({
      configFile: false,
      appType: "custom",
      server: { middlewareMode: true, hmr: false, ws: false, watch: { ignored: ["**/audiblebooks/**"] } },
    });
    let db;
    try {
      const planner = await vite.ssrLoadModule("/server/planner/service.ts");
      const points = await vite.ssrLoadModule("/server/points/service.ts");
      const database = await vite.ssrLoadModule("/server/db/client.ts");
      db = database.getDatabase();
      const date = "2026-11-21";

      await Promise.all([
        planner.setBuiltinTaskCompletion(date, "daily-0", true),
        planner.setBuiltinTaskCompletion(date, "daily-1", true),
      ]);
      await planner.setBuiltinTaskCompletion(date, "daily-0", true);
      const journal = JSON.stringify([{ type: "paragraph", content: "A moment to remember" }]);
      await planner.savePlannerJournal(date, journal);
      await planner.setBuiltinTaskCompletion(date, "daily-2", true);
      const snapshot = await planner.getPlannerSnapshot(date);
      assert.deepEqual(new Set(snapshot.checks[date]), new Set(["daily-0", "daily-1", "daily-2"]));
      assert.equal(await planner.getPlannerJournal(date), journal);
      assert.ok(snapshot.journalDates.includes(date));
      assert.equal((await points.getPointsSummary(date)).todayPoints, 30);

      const redemptions = await Promise.all(
        Array.from({ length: 5 }, () =>
          points.redeemReward({ id: "reward", name: "Reward", cost: 20 }),
        ),
      );
      assert.equal(redemptions.filter((item) => item.redeemed).length, 1);
      assert.equal((await points.getPointsSummary(date)).balance, 10);

      const googleTask = {
        source: "google", externalId: "google-task", taskListId: "list",
        title: "Google task", dueDate: date, completed: true,
        completedAt: "2026-11-21T14:00:00Z", emailFrom: null, emailUrl: null,
      };
      await planner.upsertGoogleTask(googleTask, date);
      await planner.upsertGoogleTask(googleTask, date);
      assert.equal((await planner.getExternalTask("google", "google-task")).dueDate, date);
      assert.equal((await points.getPointsSummary(date)).balance, 20);
      await planner.setExternalTaskCompletion(googleTask, false, date);
      await planner.setExternalTaskCompletion(googleTask, true, date);
      assert.equal((await points.getPointsSummary(date)).balance, 20);

      const gmailTask = {
        source: "gmail", externalId: "message", taskListId: null,
        title: "Email", dueDate: date, completed: false,
        emailFrom: "sender", emailUrl: "https://example.test/message",
      };
      assert.equal(await planner.createGmailTask(gmailTask), true);
      assert.equal(await planner.createGmailTask(gmailTask), false);
      await planner.saveGoogleConnection("user@example.test", "encrypted");
      assert.deepEqual(await planner.getGoogleConnection(), {
        email: "user@example.test", encrypted_refresh_token: "encrypted",
      });

      const extraDate = "2026-11-22";
      const actions = await vite.ssrLoadModule("/server/planner/dispatch.ts");
      const storage = createCookieSessionStorage({
        cookie: {
          name: "cyberplanner_session", httpOnly: true, path: "/", sameSite: "lax",
          secure: process.env.NODE_ENV === "production", secrets: [process.env.SESSION_SECRET],
        },
      });
      const session = await storage.getSession();
      session.set("email", process.env.GOOGLE_ALLOWED_EMAIL);
      const cookie = await storage.commitSession(session);
      async function submit(values, signedIn = true) {
        return actions.handlePlannerAction(new Request("http://localhost/", {
          method: "POST",
          headers: signedIn ? { Cookie: cookie } : {},
          body: new URLSearchParams(values),
        }));
      }
      assert.equal((await submit({ intent: "save_journal" }, false)).ok, false);
      assert.deepEqual(await submit({ intent: "__proto__" }), {
        ok: false, error: "Unknown planner action.",
      });
      assert.deepEqual(await submit({ intent: "save_journal", date: "bad", journal: "x" }), {
        ok: false, error: "That planner date is invalid.",
      });
      assert.deepEqual(await submit({ intent: "toggle_builtin", date: extraDate, taskId: "bad" }), {
        ok: false, error: "That planner task is invalid.",
      });
      assert.deepEqual(await submit({ intent: "search_gmail", query: " " }), {
        ok: false, error: "Enter a Gmail search query (up to 256 characters).",
      });
      assert.deepEqual(await submit({ intent: "redeem_reward", rewardId: "missing" }), {
        ok: false, error: "That reward is not available.",
      });
      assert.equal((await submit({ intent: "save_journal", date: extraDate, journal })).ok, true);
      assert.equal(await planner.getPlannerJournal(extraDate), journal);
      assert.equal((await submit({ intent: "save_journal", date: extraDate, journal: "" })).ok, true);
      assert.equal(await planner.getPlannerJournal(extraDate), "");
      assert.ok(!(await planner.getPlannerSnapshot(extraDate)).journalDates.includes(extraDate));

      const gamification = await vite.ssrLoadModule("/server/gamification/service.ts");
      const utils = await vite.ssrLoadModule("/shared/planner/utils.ts");
      const today = utils.dateKey(new Date());
      const initial = await gamification.getGamification(today);
      assert.equal(initial.achievements.length, 30);
      assert.ok(initial.achievements.some((item) => item.id === "daily-early-bird"));
      await gamification.saveAchievement(null, {
        title: "Test milestone", description: "Earn points", category: "Daily & Routine",
        tier: "Rare", xp: 75, target: 50, tracking: "points", taskId: null, reward: "Break",
      });
      const milestone = await db.achievement.findFirstOrThrow({ where: { title: "Test milestone" } });
      assert.equal(milestone.awardedXp, 0);

      await gamification.createQuest({ title: "Test boss", description: "", kind: "boss", tier: "Epic", points: 150 });
      const boss = await db.quest.findFirstOrThrow({ where: { title: "Test boss" } });
      const completions = await Promise.allSettled([gamification.completeQuest(boss.id), gamification.completeQuest(boss.id)]);
      assert.equal(completions.filter((result) => result.status === "fulfilled").length, 1);
      await Promise.all([gamification.getGamification(today), gamification.getGamification(today)]);
      assert.equal((await db.achievement.findUniqueOrThrow({ where: { id: milestone.id } })).awardedXp, 75);
      const earnedTotal = (await gamification.getGamification(today)).totalXp;
      assert.ok(earnedTotal >= initial.totalXp + 225);
      await gamification.deleteQuest(boss.id);
      assert.equal((await gamification.getGamification(today)).totalXp, earnedTotal);
      const beforeSpending = await points.getPointsSummary(today);
      assert.equal((await points.redeemReward({ id: "xp-test", name: "XP test", cost: 20 })).redeemed, true);
      assert.equal((await points.getPointsSummary(today)).balance, beforeSpending.balance - 20);
      assert.equal((await gamification.getGamification(today)).totalXp, earnedTotal);

      await gamification.saveAchievement(null, {
        title: "Test routine streak", description: "Two days", category: "Daily & Routine",
        tier: "Common", xp: 40, target: 2, tracking: "streak", taskId: "morning-0", reward: "",
      });
      const yesterday = utils.dateKey(utils.addDays(new Date(), -1));
      await planner.setBuiltinTaskCompletion(yesterday, "morning-0", true);
      const result = await planner.setBuiltinTaskCompletion(today, "morning-0", true);
      assert.ok(result.earnedAchievements.includes("Test routine streak"));
      await planner.setBuiltinTaskCompletion(yesterday, "morning-0", false);
      const streak = await db.achievement.findFirstOrThrow({ where: { title: "Test routine streak" } });
      assert.ok(streak.earnedAt);
      assert.equal(streak.awardedXp, 40);

      await assert.rejects(client.query(
        "INSERT INTO point_ledger (amount, entry_type, task_key) VALUES (0, 'earn', 'invalid')",
      ));
    } finally {
      if (db) await db.$disconnect();
      await vite.close();
    }
  } finally {
    await client.end();
  }
});
