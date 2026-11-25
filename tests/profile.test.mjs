import assert from "node:assert/strict";
import test from "node:test";
import { getProfileStats, levelProgress, streaks } from "../shared/planner/profile.ts";
import { dayProgress, parseDate } from "../shared/planner/utils.ts";

const morningTitles = [
  "Stretch & PT",
  "Affirmations",
  "Water",
  "Meds",
  "Lights",
  "Music",
  "Brush teeth",
  "Wash face",
  "Shower",
  "Hair",
  "Lotion",
  "Get dressed (shirt, pants or dress, socks, shoes)",
  "Breakfast",
  "Make bed",
  "Prep bag (laptop, task list, lunch)",
  "Workout",
];
const routines = morningTitles.map((title, slot) => ({
  id: slot + 1,
  list: "morning",
  weekday: null,
  title,
  kind: "side",
  points: 10,
}));
const workout = String(morningTitles.indexOf("Workout") + 1);
const water = String(morningTitles.indexOf("Water") + 1);

test("daily tasks count on their named weekday while routines count every day", () => {
  const tasks = [
    { id: 1, list: "morning", weekday: null, title: "Morning", kind: "side", points: 10 },
    { id: 2, list: "daily", weekday: "monday", title: "Monday", kind: "side", points: 10 },
  ];
  assert.deepEqual(dayProgress(parseDate("2026-11-23"), ["1", "2"], tasks), {
    completed: 2, total: 2, percent: 100,
  });
  assert.deepEqual(dayProgress(parseDate("2026-11-24"), ["1", "2"], tasks), {
    completed: 1, total: 1, percent: 100,
  });
});

test("profile stats reflect saved tasks and consecutive active days", () => {
  const checks = {
    "2026-11-16": [workout, water],
    "2026-11-17": [workout, water],
    "2026-11-18": [workout],
    "2026-11-19": [workout, water],
    "2026-11-20": [workout, water],
    "2026-11-23": [workout],
  };
  const result = getProfileStats(checks, "2026-11-21", routines);
  assert.equal(result.completedTasks, 9);
  assert.equal(result.activeDays, 5);
  assert.equal(result.activityStreak, 5);
  const later = getProfileStats(checks, "2026-11-22", routines);
  assert.equal(later.activityStreak, 0);
});

test("empty and future-only activity does not count", () => {
  const result = getProfileStats({ "2026-11-22": [workout] }, "2026-11-21", routines);
  assert.equal(result.completedTasks, 0);
  assert.equal(result.activeDays, 0);
  assert.equal(result.activityStreak, 0);
});

test("streaks ignore future dates, count yesterday, and preserve the best run", () => {
  const dates = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-20", "2026-11-23"];
  assert.deepEqual(streaks(dates, "2026-11-21"), { current: 1, best: 3 });
  assert.deepEqual(streaks(dates, "2026-11-22"), { current: 0, best: 3 });
});

test("levels advance at each 100 lifetime XP", () => {
  assert.deepEqual(levelProgress(0), { level: 1, current: 0, target: 100 });
  assert.deepEqual(levelProgress(99), { level: 1, current: 99, target: 100 });
  assert.deepEqual(levelProgress(275), { level: 3, current: 75, target: 100 });
});
