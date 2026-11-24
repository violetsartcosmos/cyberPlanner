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
    process.env.GOOGLE_CLIENT_ID = "test-client";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:5173/auth/callback";
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
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
      assert.ok(snapshot.journalDates.includes(date));
      assert.equal(snapshot.journal, journal);
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
      await planner.upsertGoogleTasks([googleTask], date);
      await planner.upsertGoogleTasks([googleTask], date);
      await planner.upsertGoogleTasks([googleTask, {
        ...googleTask, externalId: "google-task-two", title: "Another task",
      }], date);
      assert.equal((await planner.getExternalTask("google", "google-task")).dueDate, date);
      assert.equal((await planner.getExternalTask("google", "google-task-two")).completed, true);
      const earned = (await points.getPointsSummary(date, [googleTask])).earnedTaskKeys;
      assert.ok(earned.includes("external:google:google-task"));
      assert.ok(!earned.includes("external:google:google-task-two"));
      assert.equal((await points.getPointsSummary(date)).balance, 30);
      await planner.setExternalTaskCompletion(googleTask, false, date);
      await planner.setExternalTaskCompletion(googleTask, true, date);
      assert.equal((await points.getPointsSummary(date)).balance, 30);

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
      assert.equal((await planner.getPlannerSnapshot(extraDate)).journal, journal);
      assert.equal((await submit({ intent: "save_journal", date: extraDate, journal: "" })).ok, true);
      assert.equal((await planner.getPlannerSnapshot(extraDate)).journal, "");
      assert.ok(!(await planner.getPlannerSnapshot(extraDate)).journalDates.includes(extraDate));

      const gamification = await vite.ssrLoadModule("/server/gamification/service.ts");
      const utils = await vite.ssrLoadModule("/shared/planner/utils.ts");
      const today = utils.dateKey(new Date());
      const initial = await gamification.getGamification(today);
      assert.equal(initial.achievements.length, 30);
      assert.ok(initial.achievements.some((item) => item.id === "daily-early-bird"));
      await gamification.saveAchievement(null, {
        title: "Test milestone", description: "Earn points", category: "Daily & Routine",
        tier: "Rare", xp: 75, target: 60, tracking: "points", taskId: null, reward: "Break",
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

      const routine = { list: "morning", weekday: -1, slot: 2 };
      assert.equal((await db.routineTask.findUniqueOrThrow({ where: { list_weekday_slot: routine } })).title, "Water");
      assert.equal((await db.routineTask.findUniqueOrThrow({
        where: { list_weekday_slot: { list: "morning", weekday: -1, slot: 15 } },
      })).title, "Workout");
      assert.equal(initial.questTemplates.length, 16);
      assert.equal(initial.routineGroups.length, 7);
      const firstDate = "2026-10-01";
      const nextDate = "2026-10-02";
      await planner.setBuiltinTaskCompletion(firstDate, "morning-2", true);
      assert.equal((await points.getPointsSummary(firstDate)).todayPoints, 10);
      assert.equal((await submit({ intent: "update_routine_kind", ...routine, kind: "main" })).ok, true);
      await planner.setBuiltinTaskCompletion(firstDate, "morning-2", false);
      await planner.setBuiltinTaskCompletion(firstDate, "morning-2", true);
      assert.equal((await points.getPointsSummary(firstDate)).todayPoints, 10);
      await planner.setBuiltinTaskCompletion(nextDate, "morning-2", true);
      assert.equal((await points.getPointsSummary(nextDate)).todayPoints, 50);
      assert.equal((await submit({ intent: "toggle_builtin", date: "2026-11-23", taskId: "daily-4", completed: "true" })).ok, false);
      assert.equal((await submit({ intent: "toggle_builtin", date: "2026-11-28", taskId: "daily-4", completed: "true" })).ok, true);
      assert.equal((await submit({ intent: "update_routine_kind", ...routine, kind: "invalid" })).ok, false);

      const templateId = "cyber-certification";
      assert.equal((await submit({ intent: "accept_template", templateId })).ok, true);
      assert.equal((await submit({ intent: "accept_template", templateId })).ok, false);
      const accepted = await db.quest.findUniqueOrThrow({ where: { templateId } });
      assert.equal(accepted.kind, "boss");
      const update = { intent: "update_quest", id: accepted.id, title: "Edited boss", description: "Updated",
        kind: "main", tier: "Legendary", points: "70" };
      assert.equal((await submit(update)).ok, true);
      await gamification.completeQuest(accepted.id);
      const award = await db.pointLedger.findFirstOrThrow({ where: { taskKey: `quest:${accepted.id}` } });
      assert.equal(award.amount, 70);
      assert.equal((await submit({ ...update, kind: "side", points: "20" })).ok, true);
      assert.equal((await db.pointLedger.findFirstOrThrow({ where: { taskKey: `quest:${accepted.id}` } })).amount, 70);
      assert.equal((await gamification.getGamification(today)).quests.find((quest) => quest.id === accepted.id).kind, "side");
      await gamification.deleteQuest(accepted.id);
      const afterDelete = await gamification.getGamification(today);
      assert.ok(!afterDelete.quests.some((quest) => quest.id === accepted.id));
      assert.ok(afterDelete.acceptedTemplateIds.includes(templateId));
      assert.equal((await submit({ intent: "accept_template", templateId })).ok, false);
      assert.equal((await submit(update)).ok, false);

      const therapy = await vite.ssrLoadModule("/server/planner/therapy.ts");
      const therapyDate = "2026-09-10";
      const nextTherapyDate = "2026-09-11";
      const emptyPlan = await therapy.getTherapyPlan(therapyDate);
      assert.deepEqual(emptyPlan.therapySessions.map((session) => session.exercises.length), [7, 7, 9]);
      assert.equal(emptyPlan.earnedPoints, 0);
      const basePoints = (await db.pointLedger.aggregate({ where: { entryType: "earn" }, _sum: { amount: true } }))._sum.amount;
      await gamification.saveAchievement(null, {
        title: "Therapy points milestone", description: "Earn points", category: "Health & Mind",
        tier: "Common", xp: 25, target: basePoints + 10, tracking: "points", taskId: null, reward: "",
      });
      const therapyAction = {
        intent: "toggle_physical_therapy", date: therapyDate, sessionId: "am",
        exerciseId: "glute", completed: "true", points: "9999",
      };
      assert.equal((await submit({ ...therapyAction, exerciseId: "side" })).ok, false);
      const results = await Promise.all([submit(therapyAction), submit(therapyAction)]);
      assert.ok(results.every((result) => result.ok));
      assert.ok(results.some((result) => result.earnedAchievements.includes("Therapy points milestone")));
      let plan = await therapy.getTherapyPlan(therapyDate);
      assert.equal(plan.therapySessions[0].exercises.find((exercise) => exercise.id === "glute").completed, true);
      assert.equal(plan.earnedPoints, 10);
      assert.equal((await points.getPointsSummary(therapyDate)).todayPoints, 10);
      const therapyAchievement = await db.achievement.findFirstOrThrow({ where: { title: "Therapy points milestone" } });
      assert.equal(therapyAchievement.awardedXp, 25);
      assert.equal((await submit({ ...therapyAction, completed: "false" })).ok, true);
      plan = await therapy.getTherapyPlan(therapyDate);
      assert.equal(plan.therapySessions[0].exercises.find((exercise) => exercise.id === "glute").completed, false);
      assert.equal(plan.earnedPoints, 10);
      assert.equal((await submit(therapyAction)).ok, true);
      assert.equal((await submit({ ...therapyAction, sessionId: "mid" })).ok, true);
      assert.equal((await submit({ ...therapyAction, date: nextTherapyDate })).ok, true);
      assert.equal((await therapy.getTherapyPlan(therapyDate)).earnedPoints, 20);
      assert.equal((await therapy.getTherapyPlan(nextTherapyDate)).earnedPoints, 10);
      assert.equal(await db.pointLedger.count({ where: { taskKey: `pt:${therapyDate}:am:glute` } }), 1);
      assert.equal((await db.pointLedger.findFirstOrThrow({ where: { taskKey: `pt:${therapyDate}:am:glute` } })).amount, 10);
      const { getPlannerPage } = await vite.ssrLoadModule("/server/planner/page.ts");
      const loaded = await getPlannerPage(new Request(`http://localhost/api/planner?date=${therapyDate}&taskKeys=visible`, {
        headers: { Cookie: cookie },
      }));
      assert.equal(loaded.selected, therapyDate);
      assert.equal(loaded.therapy.earnedPoints, 20);
      assert.equal(loaded.therapy.therapySessions[1].exercises.find((exercise) => exercise.id === "glute").completed, true);
      assert.equal(loaded.todayPoints, 20);

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
