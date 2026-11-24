import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { refreshAchievements } from "../server/gamification/service.ts";
import { Achievements } from "../src/features/planner/components/achievements.tsx";
import { plannerLoader } from "../src/features/planner/services/planner-route.ts";

function fixture(achievements, days = [], points = 0) {
  const state = { points };
  const client = {
    achievement: {
      findMany: async () => achievements,
      update: async ({ where, data }) => Object.assign(achievements.find((item) => item.id === where.id), data),
    },
    plannerDay: { findMany: async () => days },
    pointLedger: { aggregate: async () => ({ _sum: { amount: state.points } }) },
  };
  return { client, state };
}

test("the planner loader requests only visible task keys without losing the selected date", async (t) => {
  let url;
  t.mock.method(globalThis, "fetch", async (input) => {
    url = input;
    return Response.json({ authenticated: false, missingConfiguration: [], authError: "" });
  });
  await plannerLoader({ request: new Request("http://localhost/profile?date=2026-11-21") });
  const query = new URL(url, "http://localhost").searchParams;
  assert.equal(query.get("date"), "2026-11-21");
  assert.equal(query.get("taskKeys"), "visible");
});

test("points milestones use lifetime earned points and award XP only once", async () => {
  const achievement = { id: "points", title: "Points", tracking: "points", target: 100, current: 0, xp: 25, earnedAt: null, awardedXp: 0 };
  const { client, state } = fixture([achievement], [], 90);
  assert.deepEqual(await refreshAchievements(client, "2026-11-21"), []);
  assert.equal(achievement.current, 90);
  state.points = 100;
  assert.deepEqual(await refreshAchievements(client, "2026-11-21"), ["Points"]);
  assert.equal(achievement.awardedXp, 25);
  assert.equal(achievement.current, 100);
  assert.ok(achievement.earnedAt instanceof Date);
  state.points = 150;
  assert.deepEqual(await refreshAchievements(client, "2026-11-21"), []);
  assert.equal(achievement.awardedXp, 25);
});

test("streak milestones increase and award XP once per new record, including backfilled milestones", async () => {
  const achievement = { id: "water", title: "Water", tracking: "streak", taskId: "morning-2", milestoneInterval: 3, target: 3, current: 0, xp: 50, earnedAt: null, awardedXp: 0 };
  const days = Array.from({ length: 7 }, (_, index) => ({
    day: new Date(`2026-11-${String(15 + index).padStart(2, "0")}T00:00:00Z`),
    checks: ["morning-2"],
  }));
  const { client } = fixture([achievement], days);
  assert.deepEqual(await refreshAchievements(client, "2026-11-17"), ["Water"]);
  assert.equal(achievement.current, 3);
  assert.equal(achievement.target, 6);
  assert.equal(achievement.awardedXp, 50);
  const earnedAt = achievement.earnedAt;
  assert.deepEqual(await refreshAchievements(client, "2026-11-21"), ["Water"]);
  assert.equal(achievement.current, 7);
  assert.equal(achievement.target, 9);
  assert.equal(achievement.awardedXp, 100);
  assert.equal(achievement.earnedAt, earnedAt);
  assert.deepEqual(await refreshAchievements(client, "2026-11-21"), []);
  days[3].checks = [];
  await refreshAchievements(client, "2026-11-22");
  assert.equal(achievement.current, 3);
  assert.equal(achievement.target, 9);
  assert.equal(achievement.awardedXp, 100);
  await refreshAchievements(client, "2026-11-23");
  assert.equal(achievement.current, 0);
});

test("activity streak counts built-in checks, not invalid or future tasks", async () => {
  const achievement = { id: "active", title: "Active", tracking: "activity_streak", taskId: null, milestoneInterval: 2, target: 2, current: 0, xp: 10, earnedAt: null, awardedXp: 0 };
  const days = [
    { day: new Date("2026-11-20T00:00:00Z"), checks: ["morning-0"] },
    { day: new Date("2026-11-21T00:00:00Z"), checks: ["unknown"] },
    { day: new Date("2026-11-22T00:00:00Z"), checks: ["night-0"] },
  ];
  const { client } = fixture([achievement], days);
  assert.deepEqual(await refreshAchievements(client, "2026-11-21"), []);
  assert.equal(achievement.current, 1);
  days[1].checks = ["night-0"];
  assert.deepEqual(await refreshAchievements(client, "2026-11-21"), ["Active"]);
  assert.equal(achievement.target, 4);
});

test("multiple streaks use shared day history without counting duplicate checks twice", async () => {
  const base = { tracking: "streak", milestoneInterval: 3, target: 3, current: 0, xp: 10, earnedAt: null, awardedXp: 0 };
  const achievements = [
    { ...base, id: "water", title: "Water", taskId: "morning-2" },
    { ...base, id: "walk", title: "Walk", taskId: "morning-3" },
    { ...base, id: "water-again", title: "Water again", taskId: "morning-2" },
  ];
  const days = [
    { day: new Date("2026-11-20T00:00:00Z"), checks: ["morning-2", "morning-2"] },
    { day: new Date("2026-11-21T00:00:00Z"), checks: ["morning-2", "morning-3"] },
  ];
  const { client } = fixture(achievements, days);
  client.plannerDay.findMany = () => { throw new Error("Day history should be reused"); };
  await refreshAchievements(client, "2026-11-21", days);
  assert.deepEqual(achievements.map((item) => item.current), [2, 1, 2]);
});

test("a long recorded streak awards every missed milestone exactly once", async () => {
  const achievement = { id: "week", title: "Week", tracking: "activity_streak", taskId: null, milestoneInterval: 7, target: 7, current: 0, xp: 50, earnedAt: null, awardedXp: 0 };
  const days = Array.from({ length: 14 }, (_, index) => ({
    day: new Date(`2026-11-${String(index + 1).padStart(2, "0")}T00:00:00Z`),
    checks: ["morning-0"],
  }));
  const { client } = fixture([achievement], days);
  assert.deepEqual(await refreshAchievements(client, "2026-11-14"), ["Week"]);
  assert.equal(achievement.current, 14);
  assert.equal(achievement.target, 21);
  assert.equal(achievement.awardedXp, 100);
  await refreshAchievements(client, "2026-11-14");
  assert.equal(achievement.awardedXp, 100);
});

test("achievement cards show earned and in-progress status without manual controls", () => {
  const base = { description: "Earn points", category: "Daily & Routine", tier: "Common", xp: 25, target: 100, current: 50, icon: "award", tracking: "points", taskId: null, milestoneInterval: null, reward: "", awardedXp: 0 };
  const achievements = [
    { ...base, id: "earned", title: "Earned goal", earnedAt: "2026-11-20T00:00:00Z", awardedXp: 25 },
    { ...base, id: "progress", title: "Upcoming goal", earnedAt: null },
  ];
  const router = createMemoryRouter([{ path: "/", element: React.createElement(Achievements, { achievements, earned: 1 }) }]);
  const html = renderToStaticMarkup(React.createElement(RouterProvider, { router }));
  assert.match(html, /1 \/ 2 earned/);
  assert.match(html, /> EARNED · COMMON/);
  assert.match(html, /IN PROGRESS/);
  assert.match(html, /<option value="progress">In progress<\/option>/);
  assert.doesNotMatch(html, /\b(?:locked|unlocked|badges)\b/i);
  assert.doesNotMatch(html, /name="intent" value="(?:advance|delete)_achievement"/);
});

test("the achievements page displays its empty-filter message when there are no cards", () => {
  const router = createMemoryRouter([{ path: "/", element: React.createElement(Achievements, { achievements: [], earned: 0 }) }]);
  const html = renderToStaticMarkup(React.createElement(RouterProvider, { router }));
  assert.match(html, /No achievements match these filters/);
});
