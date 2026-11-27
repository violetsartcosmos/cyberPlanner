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
      const externalTasks = await vite.ssrLoadModule("/server/external-tasks/service.ts");
      const googleConnection = await vite.ssrLoadModule("/server/google/connection.ts");
      const journals = await vite.ssrLoadModule("/server/journals/service.ts");
      const routines = await vite.ssrLoadModule("/server/routines/service.ts");
      const page = await vite.ssrLoadModule("/server/planner/page.ts");
      const points = await vite.ssrLoadModule("/server/points/service.ts");
      const database = await vite.ssrLoadModule("/server/db/client.ts");
      db = database.getDatabase();
      const date = "2026-11-21";
      const getPlannerSnapshot = page.getPlannerCalendarPage;
      const routineId = async (list, weekday, title) => String((await db.routineTask.findFirstOrThrow({
        where: weekday === null
          ? { list, title, groups: { none: {} } }
          : { list, title, groups: { some: { group: { weekday } } } },
      })).id);
      const daily0 = await routineId("daily", "saturday", "Make or change the bed");
      const daily1 = await routineId("daily", "saturday", "Refresh towels");
      const daily2 = await routineId("daily", "saturday", "Clean the car");
      const morning0 = await routineId("morning", null, "Stretch & PT");
      const morning2 = await routineId("morning", null, "Water");
      const saturday4 = await routineId("daily", "saturday", "Declutter one area");

      await Promise.all([
        routines.setRoutineCompletion(date, daily0, true),
        routines.setRoutineCompletion(date, daily1, true),
      ]);
      await routines.setRoutineCompletion(date, daily0, true);
      assert.equal(await db.journal.count({ where: { day: database.databaseDate(date) } }), 0);
      const journal = JSON.stringify([{ type: "paragraph", content: "A moment to remember" }]);
      await journals.saveJournal(date, journal);
      const savedJournal = await db.journal.findUniqueOrThrow({ where: { day: database.databaseDate(date) } });
      assert.ok(savedJournal.id > 0);
      await journals.saveJournal(date, journal);
      assert.equal((await db.journal.findUniqueOrThrow({ where: { day: database.databaseDate(date) } })).id, savedJournal.id);
      await routines.setRoutineCompletion(date, daily2, true);
      const snapshot = await getPlannerSnapshot(date);
      assert.deepEqual(new Set(snapshot.checks[date]), new Set([daily0, daily1, daily2]));
      assert.ok(!("journalDates" in snapshot));
      assert.ok(!("journal" in snapshot));
      assert.equal((await journals.getJournal(date)).content, journal);
      const { app } = await vite.ssrLoadModule("/server/app.ts");
      const sessionStorage = createCookieSessionStorage({
        cookie: {
          name: "cyberplanner_session", httpOnly: true, path: "/", sameSite: "lax",
          secure: false, secrets: [process.env.SESSION_SECRET],
        },
      });
      const apiSession = await sessionStorage.getSession();
      apiSession.set("email", process.env.GOOGLE_ALLOWED_EMAIL);
      const apiCookie = await sessionStorage.commitSession(apiSession);
      const journalHeaders = { Cookie: apiCookie, Origin: "http://localhost", "Content-Type": "application/json" };
      const questRequest = (url, method = "GET", body) => app.request(url, {
        method,
        headers: journalHeaders,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const journalUrl = `http://localhost/api/journals/${date}`;
      assert.deepEqual(await (await app.request(journalUrl, { headers: journalHeaders })).json(), { date, content: journal });
      const missingJournal = await app.request("http://localhost/api/journals/2026-11-20", { headers: journalHeaders });
      assert.equal(missingJournal.status, 404);
      const updatedJournal = JSON.stringify([{ type: "paragraph", content: "Updated" }]);
      const journalWrite = await app.request(journalUrl, {
        method: "PUT", headers: journalHeaders, body: JSON.stringify({ content: updatedJournal }),
      });
      assert.equal(journalWrite.status, 200);
      assert.deepEqual(await journalWrite.json(), { date, content: updatedJournal });
      assert.equal((await journals.getJournal(date)).content, updatedJournal);
      const newJournalUrl = "http://localhost/api/journals/2026-11-20";
      const createdJournal = await app.request(newJournalUrl, {
        method: "PUT", headers: journalHeaders, body: JSON.stringify({ content: "A new entry" }),
      });
      assert.equal(createdJournal.status, 200);
      assert.deepEqual(await (await app.request(newJournalUrl, { headers: journalHeaders })).json(),
        { date: "2026-11-20", content: "A new entry" });
      assert.equal((await journals.getJournal("2026-11-20")).content, "A new entry");
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
      await externalTasks.upsertGoogleTasks([googleTask], date);
      await externalTasks.upsertGoogleTasks([googleTask], date);
      await externalTasks.upsertGoogleTasks([googleTask, {
        ...googleTask, externalId: "google-task-two", title: "Another task",
      }], date);
      assert.equal((await externalTasks.getExternalTask("google", "google-task")).dueDate, date);
      assert.equal((await externalTasks.getExternalTask("google", "google-task-two")).completed, true);
      const earned = (await points.getPointsSummary(date, [googleTask])).earnedTaskKeys;
      assert.ok(earned.includes("external:google:google-task"));
      assert.ok(!earned.includes("external:google:google-task-two"));
      assert.equal((await points.getPointsSummary(date)).balance, 30);
      await externalTasks.setExternalTaskCompletion(googleTask, false, date);
      await externalTasks.setExternalTaskCompletion(googleTask, true, date);
      assert.equal((await points.getPointsSummary(date)).balance, 30);

      const gmailTask = {
        source: "gmail", externalId: "message", taskListId: null,
        title: "Email", dueDate: date, completed: false,
        emailFrom: "sender", emailUrl: "https://example.test/message",
      };
      assert.equal(await externalTasks.createGmailTask(gmailTask), true);
      assert.equal(await externalTasks.createGmailTask(gmailTask), false);
      await googleConnection.saveGoogleConnection("user@example.test", "encrypted");
      assert.deepEqual(await googleConnection.getGoogleConnection(), {
        email: "user@example.test", encrypted_refresh_token: "encrypted",
      });

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
        tier: "Common", xp: 40, target: 2, tracking: "streak", taskId: morning0, reward: "",
      });
      const yesterday = utils.dateKey(utils.addDays(new Date(), -1));
      await routines.setRoutineCompletion(yesterday, morning0, true);
      const result = await routines.setRoutineCompletion(today, morning0, true);
      assert.ok(result.earnedAchievements.includes("Test routine streak"));
      await routines.setRoutineCompletion(yesterday, morning0, false);
      const streak = await db.achievement.findFirstOrThrow({ where: { title: "Test routine streak" } });
      assert.ok(streak.earnedAt);
      assert.equal(streak.awardedXp, 40);

      assert.equal((await db.routineTask.findUniqueOrThrow({ where: { id: Number(morning2) } })).title, "Water");
      assert.ok(await routineId("morning", null, "Workout"));
      assert.equal(initial.questTemplates.length, 16);
      assert.equal(initial.routineGroups.length, 7);
      const firstDate = "2026-10-01";
      const nextDate = "2026-10-02";
      await routines.setRoutineCompletion(firstDate, morning2, true);
      assert.equal((await points.getPointsSummary(firstDate)).todayPoints, 10);
      assert.equal((await questRequest(`http://localhost/api/routines/${morning2}`, "PATCH", { kind: "main" })).status, 200);
      await routines.setRoutineCompletion(firstDate, morning2, false);
      await routines.setRoutineCompletion(firstDate, morning2, true);
      assert.equal((await points.getPointsSummary(firstDate)).todayPoints, 10);
      await routines.setRoutineCompletion(nextDate, morning2, true);
      assert.equal((await points.getPointsSummary(nextDate)).todayPoints, 50);
      assert.equal((await questRequest(`http://localhost/api/routines/${saturday4}/completions/2026-11-23`, "PUT", { completed: true })).status, 404);
      assert.equal((await questRequest(`http://localhost/api/routines/${saturday4}/completions/2026-11-28`, "PUT", { completed: true })).status, 200);
      assert.equal((await questRequest(`http://localhost/api/routines/${morning2}`, "PATCH", { kind: "invalid" })).status, 400);

      const templateId = "cyber-certification";
      const templateUrl = `http://localhost/api/quest-templates/${templateId}/accept`;
      assert.equal((await questRequest(templateUrl, "POST")).status, 201);
      assert.equal((await questRequest(templateUrl, "POST")).status, 409);
      const accepted = await db.quest.findUniqueOrThrow({ where: { templateId } });
      assert.equal(accepted.kind, "boss");
      const acceptedUrl = `http://localhost/api/quests/${accepted.id}`;
      const update = { title: "Edited boss", description: "Updated",
        kind: "main", tier: "Legendary", points: 70 };
      assert.equal((await questRequest(acceptedUrl, "PATCH", update)).status, 200);
      await gamification.completeQuest(accepted.id);
      const award = await db.pointLedger.findFirstOrThrow({ where: { taskKey: `quest:${accepted.id}` } });
      assert.equal(award.amount, 70);
      assert.equal((await questRequest(acceptedUrl, "PATCH", { ...update, kind: "side", points: 20 })).status, 200);
      assert.equal((await db.pointLedger.findFirstOrThrow({ where: { taskKey: `quest:${accepted.id}` } })).amount, 70);
      assert.equal((await gamification.getGamification(today)).quests.find((quest) => quest.id === accepted.id).kind, "side");
      await gamification.deleteQuest(accepted.id);
      const afterDelete = await gamification.getGamification(today);
      assert.ok(!afterDelete.quests.some((quest) => quest.id === accepted.id));
      assert.ok(afterDelete.acceptedTemplateIds.includes(templateId));
      assert.equal((await questRequest(templateUrl, "POST")).status, 409);
      assert.equal((await questRequest(acceptedUrl, "PATCH", update)).status, 404);

      const therapy = await vite.ssrLoadModule("/server/therapy/service.ts");
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
      const therapyCompletionUrl = `http://localhost/api/therapy/sessions/am/exercises/glute/completions/${therapyDate}`;
      const invalidTherapyUrl = `http://localhost/api/therapy/sessions/am/exercises/side/completions/${therapyDate}`;
      assert.equal((await questRequest(invalidTherapyUrl, "PUT", { completed: true })).status, 404);
      const therapyResponses = await Promise.all([
        questRequest(therapyCompletionUrl, "PUT", { completed: true }),
        questRequest(therapyCompletionUrl, "PUT", { completed: true }),
      ]);
      assert.ok(therapyResponses.every((response) => response.status === 200));
      const therapyResults = await Promise.all(therapyResponses.map((response) => response.json()));
      assert.ok(therapyResults.some((result) => result.earnedAchievements.includes("Therapy points milestone")));
      let plan = await therapy.getTherapyPlan(therapyDate);
      assert.equal(plan.therapySessions[0].exercises.find((exercise) => exercise.id === "glute").completed, true);
      assert.equal(plan.earnedPoints, 10);
      assert.equal((await points.getPointsSummary(therapyDate)).todayPoints, 10);
      const therapyAchievement = await db.achievement.findFirstOrThrow({ where: { title: "Therapy points milestone" } });
      assert.equal(therapyAchievement.awardedXp, 25);
      assert.equal((await questRequest(therapyCompletionUrl, "PUT", { completed: false })).status, 200);
      plan = await therapy.getTherapyPlan(therapyDate);
      assert.equal(plan.therapySessions[0].exercises.find((exercise) => exercise.id === "glute").completed, false);
      assert.equal(plan.earnedPoints, 10);
      assert.equal((await questRequest(therapyCompletionUrl, "PUT", { completed: true })).status, 200);
      assert.equal((await questRequest(`http://localhost/api/therapy/sessions/mid/exercises/glute/completions/${therapyDate}`, "PUT", { completed: true })).status, 200);
      assert.equal((await questRequest(`http://localhost/api/therapy/sessions/am/exercises/glute/completions/${nextTherapyDate}`, "PUT", { completed: true })).status, 200);
      assert.equal((await therapy.getTherapyPlan(therapyDate)).earnedPoints, 20);
      assert.equal((await therapy.getTherapyPlan(nextTherapyDate)).earnedPoints, 10);
      assert.equal(await db.pointLedger.count({ where: { taskKey: `pt:${therapyDate}:am:glute` } }), 1);
      assert.equal((await db.pointLedger.findFirstOrThrow({ where: { taskKey: `pt:${therapyDate}:am:glute` } })).amount, 10);
      const { getPlannerCalendarPage } = await vite.ssrLoadModule("/server/planner/page.ts");
      const { getSessionPage } = await vite.ssrLoadModule("/server/session/page.ts");
      const loaded = await getSessionPage(new Request(`http://localhost/api/session?date=${therapyDate}`, {
        headers: { Cookie: apiCookie },
      }));
      assert.equal(loaded.selected, therapyDate);
      assert.ok(!("therapy" in loaded));
      assert.ok(!("journal" in loaded));
      assert.ok(!("journalDates" in loaded));
      assert.ok(!("checks" in loaded));
      assert.ok(!("tasks" in loaded));
      assert.ok(!("todayPoints" in loaded));
      const calendarPage = await getPlannerCalendarPage(therapyDate);
      assert.equal(calendarPage.todayPoints, 20);
      assert.ok(calendarPage.checks[therapyDate]);
      const calendarResponse = await app.request(
        `http://localhost/api/planner/calendar?date=${therapyDate}`,
        { headers: journalHeaders },
      );
      assert.equal(calendarResponse.status, 200);
      assert.equal(calendarResponse.headers.get("cache-control"), "no-store");
      assert.equal((await calendarResponse.json()).todayPoints, 20);

      const questUrl = "http://localhost/api/quests";
      const crudDate = "2026-06-01";
      const crudUrl = `http://localhost/api/journals/${crudDate}`;
      const balanceBeforeJournal = (await points.getPointsSummary(crudDate)).balance;
      const journalCreates = await Promise.all([
        questRequest("http://localhost/api/journals", "POST", { date: crudDate }),
        questRequest("http://localhost/api/journals", "POST", { date: crudDate }),
      ]);
      assert.deepEqual(journalCreates.map((response) => response.status).sort(), [201, 409]);
      assert.deepEqual(await journalCreates.find((response) => response.status === 201).json(), { date: crudDate, content: "" });
      const journalList = await questRequest("http://localhost/api/journals", "GET");
      assert.equal(journalList.headers.get("cache-control"), null);
      const journalEntries = await journalList.json();
      assert.deepEqual(journalEntries.find((item) => item.date === crudDate), { date: crudDate, content: "" });
      assert.deepEqual(journalEntries, [...journalEntries].sort((a, b) => b.date.localeCompare(a.date)));
      assert.ok(!(await (await questRequest("http://localhost/api/journals/markers", "GET")).json())
        .some((item) => item.date === crudDate));
      assert.deepEqual(await (await questRequest(crudUrl, "GET")).json(), { date: crudDate, content: "" });
      assert.equal((await questRequest(crudUrl, "PUT", { content: " \n" })).status, 200);
      assert.ok((await (await questRequest("http://localhost/api/journals/markers", "GET")).json())
        .some((item) => item.date === crudDate));
      assert.equal((await questRequest(crudUrl, "PUT", { content: "CRUD example" })).status, 200);
      assert.deepEqual(await (await questRequest(crudUrl, "GET")).json(), { date: crudDate, content: "CRUD example" });
      assert.ok((await (await questRequest("http://localhost/api/journals/markers", "GET")).json())
        .some((item) => item.date === crudDate));
      assert.equal((await journals.getJournal(crudDate)).content, "CRUD example");
      const deletedJournal = await questRequest(crudUrl, "DELETE");
      assert.equal(deletedJournal.status, 204);
      assert.equal(await deletedJournal.text(), "");
      assert.equal((await questRequest(crudUrl, "GET")).status, 404);
      assert.equal((await questRequest(crudUrl, "DELETE")).status, 404);
      assert.ok(!(await (await questRequest("http://localhost/api/journals", "GET")).json()).some((item) => item.date === crudDate));
      assert.equal((await points.getPointsSummary(crudDate)).balance, balanceBeforeJournal);
      const createdResponse = await questRequest(questUrl, "POST", {
        title: " API quest ", description: "Details", kind: "side", tier: "Common", points: 25, completedAt: "2020-01-01",
      });
      assert.equal(createdResponse.status, 201);
      const created = await createdResponse.json();
      assert.equal(created.completedAt, null);
      const questItemUrl = `${questUrl}/${created.id}`;
      assert.equal((await (await questRequest(questItemUrl, "GET")).json()).title, "API quest");
      assert.ok((await (await questRequest(questUrl, "GET")).json()).some((item) => item.id === created.id));
      const patched = await questRequest(questItemUrl, "PATCH", { title: " Changed ", description: "", points: 35, deleted: true });
      assert.equal(patched.status, 200);
      const patchedQuest = await patched.json();
      assert.equal(patchedQuest.title, "Changed");
      assert.equal(patchedQuest.description, "");
      assert.equal(patchedQuest.kind, "side");
      assert.equal(patchedQuest.points, 35);
      assert.equal((await questRequest(`${questItemUrl}/complete`, "POST")).status, 200);
      assert.equal((await questRequest(`${questItemUrl}/complete`, "POST")).status, 409);
      assert.equal((await db.pointLedger.findFirstOrThrow({ where: { taskKey: `quest:${created.id}` } })).amount, 35);
      assert.equal((await questRequest(questItemUrl, "DELETE")).status, 204);
      assert.equal((await questRequest(questItemUrl, "GET")).status, 404);
      assert.equal((await questRequest(questItemUrl, "PATCH", { title: "Again" })).status, 404);
      assert.equal(await db.pointLedger.count({ where: { taskKey: `quest:${created.id}` } }), 1);
      const anotherTemplate = initial.questTemplates.find((item) => item.id !== templateId);
      const acceptUrl = `http://localhost/api/quest-templates/${anotherTemplate.id}/accept`;
      assert.equal((await questRequest(acceptUrl, "POST")).status, 201);
      assert.equal((await questRequest(acceptUrl, "POST")).status, 409);

      const routineList = await questRequest("http://localhost/api/routines", "GET");
      assert.equal(routineList.status, 200);
      assert.ok((await routineList.json()).routines.some((item) => String(item.id) === morning2));
      const resourceDate = "2026-08-12";
      const routineCompletionUrl = `http://localhost/api/routines/${morning2}/completions/${resourceDate}`;
      const completionQuery = `http://localhost/api/routines/completions?date=${resourceDate}`;
      assert.deepEqual((await (await questRequest(completionQuery, "GET")).json()).taskIds, []);
      const routineCompleted = await questRequest(routineCompletionUrl, "PUT", { completed: true, points: 9999 });
      assert.equal(routineCompleted.status, 200);
      const routineCompletedBody = await routineCompleted.json();
      assert.deepEqual(routineCompletedBody.checkedTaskIds, [morning2]);
      assert.ok(!("checks" in routineCompletedBody));
      assert.deepEqual((await (await questRequest(completionQuery, "GET")).json()).taskIds, [morning2]);
      const routineUnchecked = await questRequest(routineCompletionUrl, "PUT", { completed: false });
      assert.equal(routineUnchecked.status, 200);
      assert.deepEqual((await routineUnchecked.json()).checkedTaskIds, []);
      assert.equal((await questRequest(routineCompletionUrl, "PUT", { completed: true })).status, 200);
      assert.equal(await db.pointLedger.count({ where: { taskKey: `builtin:${resourceDate}:${morning2}` } }), 1);
      assert.equal((await questRequest("http://localhost/api/routines/2147483647", "PATCH", { kind: "side" })).status, 404);
      assert.equal((await questRequest(`http://localhost/api/routines/${morning2}`, "PATCH", { kind: "side", points: 9999 })).status, 200);
      assert.equal((await db.routineTask.findUniqueOrThrow({ where: { id: Number(morning2) } })).points, 10);

      const therapyUrl = `http://localhost/api/therapy/sessions/am/exercises/glute/completions/${resourceDate}`;
      assert.equal((await questRequest(therapyUrl, "PUT", { completed: true, points: 9999 })).status, 200);
      assert.equal((await questRequest(therapyUrl, "PUT", { completed: false })).status, 200);
      assert.equal((await questRequest(therapyUrl, "PUT", { completed: true })).status, 200);
      assert.equal(await db.pointLedger.count({ where: { taskKey: `pt:${resourceDate}:am:glute` } }), 1);
      assert.equal((await db.pointLedger.findFirstOrThrow({ where: { taskKey: `pt:${resourceDate}:am:glute` } })).amount, 10);
      const resourcePlan = await (await questRequest(`http://localhost/api/therapy/sessions?date=${resourceDate}`, "GET")).json();
      assert.equal(resourcePlan.therapySessions[0].exercises.find((exercise) => exercise.id === "glute").completed, true);
      assert.equal((await questRequest(`http://localhost/api/therapy/sessions/am/exercises/missing/completions/${resourceDate}`, "PUT", { completed: true })).status, 404);

      const achievementResponse = await questRequest("http://localhost/api/achievements", "GET");
      assert.equal(achievementResponse.status, 200);
      assert.ok((await achievementResponse.json()).some((item) => item.id === milestone.id));
      const newAchievement = await questRequest("http://localhost/api/achievements", "POST", {
        title: "API achievement", description: "Earn points", category: "Daily & Routine",
        tier: "Common", xp: 10, target: 1, tracking: "points", awardedXp: 9999,
      });
      assert.equal(newAchievement.status, 201);
      const newAchievementBody = await newAchievement.json();
      assert.ok(newAchievementBody.achievement.id);
      assert.ok(newAchievementBody.achievement.earnedAt);
      assert.equal(newAchievementBody.achievement.awardedXp, 10);
      assert.equal(newAchievementBody.achievement.reward, "");
      assert.ok(newAchievementBody.earnedAchievements.includes("API achievement"));
      assert.ok((await db.achievement.findUniqueOrThrow({ where: { id: newAchievementBody.achievement.id } })).earnedAt);
      const templatesResponse = await questRequest("http://localhost/api/quest-templates", "GET");
      assert.equal((await templatesResponse.json()).length, initial.questTemplates.length);
      const taskResponse = await questRequest(`http://localhost/api/external-tasks?date=${date}`, "GET");
      assert.ok((await taskResponse.json()).some((item) => item.source === "gmail" && item.externalId === "message"));
      const externalUrl = "http://localhost/api/external-tasks/gmail/message/completion";
      assert.equal((await questRequest(externalUrl, "PUT", { date, completed: true })).status, 200);
      assert.equal((await questRequest(externalUrl, "PUT", { date, completed: false })).status, 200);
      assert.equal((await questRequest(externalUrl, "PUT", { date, completed: true })).status, 200);
      assert.equal(await db.pointLedger.count({ where: { taskKey: "external:gmail:message" } }), 1);
      assert.equal((await questRequest("http://localhost/api/external-tasks/gmail/missing/completion", "PUT", { date, completed: true })).status, 404);
      const pointsResponse = await questRequest(`http://localhost/api/points?date=${date}`, "GET");
      assert.deepEqual(await pointsResponse.json(), await points.getPointsSummary(date));
      const rewardsResponse = await questRequest("http://localhost/api/rewards", "GET");
      const rewardList = await rewardsResponse.json();
      const currentBalance = (await points.getPointsSummary(date)).balance;
      const affordable = rewardList.find((reward) => reward.cost <= currentBalance);
      const expensive = rewardList.find((reward) => reward.cost > currentBalance);
      assert.ok(affordable && expensive);
      assert.equal((await questRequest(`http://localhost/api/rewards/${expensive.id}/redemptions`, "POST")).status, 409);
      const redemption = await questRequest(`http://localhost/api/rewards/${affordable.id}/redemptions`, "POST");
      assert.equal(redemption.status, 201);
      assert.equal((await redemption.json()).balance, currentBalance - affordable.cost);
      assert.equal((await questRequest("http://localhost/api/rewards/missing/redemptions", "POST")).status, 404);

      const longJournal = "x".repeat(1_000_001);
      const longJournalDate = "2026-07-01";
      assert.equal((await questRequest(`http://localhost/api/journals/${longJournalDate}`, "PUT", { content: longJournal })).status, 200);
      assert.equal((await journals.getJournal(longJournalDate)).content, longJournal);
      assert.equal((await questRequest(`http://localhost/api/journals/${longJournalDate}`, "PUT", { content: 123 })).status, 500);
      assert.equal((await journals.getJournal(longJournalDate)).content, longJournal);

      const largeQuest = await questRequest(questUrl, "POST", {
        title: "Large quest", description: "", kind: "side", tier: "Common", points: 100001,
      });
      assert.equal(largeQuest.status, 201);
      assert.equal((await largeQuest.json()).points, 100001);
      const streakInput = {
        title: "API streak", description: "A routine streak", category: "Daily & Routine", tier: "Common",
        xp: 100001, target: 3651, tracking: "streak", taskId: morning0,
      };
      const apiStreak = await questRequest("http://localhost/api/achievements", "POST", streakInput);
      assert.equal(apiStreak.status, 201);
      assert.equal((await apiStreak.json()).achievement.taskId, morning0);
      assert.equal((await questRequest("http://localhost/api/achievements", "POST", { ...streakInput, taskId: daily0 })).status, 400);
      assert.equal((await questRequest("http://localhost/api/achievements", "POST", { ...streakInput, taskId: "999999999" })).status, 400);
      assert.equal((await questRequest(questUrl, "POST", {
        title: "Invalid quest", description: "", kind: "side", tier: "Common", points: 0,
      })).status, 500);
      assert.equal(await db.quest.count({ where: { title: "Invalid quest" } }), 0);

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
