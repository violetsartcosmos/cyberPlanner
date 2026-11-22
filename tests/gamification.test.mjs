import assert from "node:assert/strict";
import test from "node:test";
import { refreshStreakAchievements } from "../server/gamification/service.ts";

test("streak achievements unlock once at their configured target and stay unlocked", async () => {
  const achievement = { id: "workout", title: "Workout Queen", taskId: "morning-15", target: 3, current: 0, xp: 75, unlockedAt: null, awardedXp: 0 };
  const days = [
    { day: new Date("2026-11-18T00:00:00Z"), checks: ["morning-15"] },
    { day: new Date("2026-11-19T00:00:00Z"), checks: ["morning-15"] },
    { day: new Date("2026-11-21T00:00:00Z"), checks: ["morning-15"] },
    { day: new Date("2026-11-23T00:00:00Z"), checks: ["morning-15"] },
  ];
  const client = {
    achievement: {
      findMany: async () => achievement.unlockedAt ? [] : [achievement],
      update: async ({ data }) => Object.assign(achievement, data),
    },
    plannerDay: { findMany: async () => days },
  };
  assert.deepEqual(await refreshStreakAchievements(client, "2026-11-21"), []);
  assert.equal(achievement.current, 1);
  days[2].day = new Date("2026-11-20T00:00:00Z");
  assert.deepEqual(await refreshStreakAchievements(client, "2026-11-21"), ["Workout Queen"]);
  assert.equal(achievement.awardedXp, 75);
  assert.equal(achievement.current, 3);
  days[0].checks = [];
  assert.deepEqual(await refreshStreakAchievements(client, "2026-11-21"), []);
  assert.equal(achievement.awardedXp, 75);
  assert.ok(achievement.unlockedAt);
});
