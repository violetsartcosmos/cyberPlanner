import type { Prisma } from "../generated/prisma/client";
import { dateString, getDatabase, serializableTransaction } from "../db/client";
import { awardTaskPoints } from "../points/service";
import { streaks } from "../../shared/planner/profile";
import { dateKey, dayProgress, parseDate } from "../../shared/planner/utils";

type AchievementInput = {
  title: string;
  description: string;
  category: string;
  tier: string;
  xp: number;
  target: number;
  tracking: "points" | "streak";
  taskId: string | null;
  reward: string;
};

type AchievementDay = { day: Date; checks: Prisma.JsonValue };

export async function refreshAchievements(client: Prisma.TransactionClient, today: string, plannerDays?: AchievementDay[]) {
  const [achievements, days, taskPoints] = await Promise.all([
    client.achievement.findMany({ where: { deleted: false } }),
    plannerDays ?? client.plannerDay.findMany({ select: { day: true, checks: true } }),
    client.pointLedger.aggregate({ where: { entryType: "earn" }, _sum: { amount: true } }),
  ]);
  const earnedAchievements: string[] = [];
  let streakResults: Map<string, ReturnType<typeof streaks>> | undefined;
  for (const achievement of achievements) {
    if (achievement.tracking === "points") {
      if (achievement.earnedAt) continue;
      const current = Math.min(taskPoints._sum.amount ?? 0, achievement.target);
      const earned = current >= achievement.target;
      if (earned || current !== achievement.current) {
        await client.achievement.update({
          where: { id: achievement.id },
          data: { current, ...(earned ? { earnedAt: new Date(), awardedXp: achievement.xp } : {}) },
        });
        if (earned) earnedAchievements.push(achievement.title);
      }
      continue;
    }
    if (achievement.tracking !== "streak" && achievement.tracking !== "activity_streak") {
      throw new Error("Stored achievement tracking is invalid.");
    }
    if (!achievement.milestoneInterval || achievement.milestoneInterval < 1) {
      throw new Error("Stored achievement milestone interval is invalid.");
    }
    if (!streakResults) {
      const taskIds = new Set(achievements.flatMap((item) =>
        item.tracking === "streak" && item.taskId !== null ? [item.taskId] : []
      ));
      const taskDates = new Map([...taskIds].map((id) => [id, [] as string[]]));
      const activityDates: string[] = [];
      const hasActivityStreak = achievements.some((item) => item.tracking === "activity_streak");
      for (const day of days) {
        if (!Array.isArray(day.checks) || !day.checks.every((item) => typeof item === "string")) {
          throw new Error("Stored planner checks are invalid.");
        }
        const date = dateString(day.day);
        for (const taskId of new Set(day.checks)) {
          taskDates.get(taskId)?.push(date);
        }
        if (hasActivityStreak && dayProgress(parseDate(date), day.checks).completed > 0) activityDates.push(date);
      }
      streakResults = new Map();
      for (const [taskId, dates] of taskDates) {
        streakResults.set(JSON.stringify(["streak", taskId]), streaks(dates, today));
      }
      streakResults.set(JSON.stringify(["streak", null]), streaks([], today));
      if (hasActivityStreak) {
        const activity = streaks(activityDates, today);
        for (const item of achievements) {
          if (item.tracking === "activity_streak") streakResults.set(JSON.stringify([item.tracking, item.taskId]), activity);
        }
      }
    }
    const result = streakResults.get(JSON.stringify([achievement.tracking, achievement.taskId]));
    if (!result) throw new Error("Could not calculate achievement streak.");
    const milestones = result.best >= achievement.target
      ? Math.floor((result.best - achievement.target) / achievement.milestoneInterval) + 1
      : 0;
    const target = achievement.target + milestones * achievement.milestoneInterval;
    const current = Math.min(result.current, target);
    if (milestones || current !== achievement.current) {
      await client.achievement.update({
        where: { id: achievement.id },
        data: {
          current, target,
          ...(milestones ? {
            earnedAt: achievement.earnedAt ?? new Date(),
            awardedXp: achievement.awardedXp + milestones * achievement.xp,
          } : {}),
        },
      });
      if (milestones) earnedAchievements.push(achievement.title);
    }
  }
  return earnedAchievements;
}

export async function getGamification(today: string) {
  return serializableTransaction(async (client) => {
    const plannerDays = await client.plannerDay.findMany({ select: { day: true, checks: true, journal: true } });
    const newlyEarned = await refreshAchievements(client, today, plannerDays);
    const [achievements, quests, taskXp, achievementXp] = await Promise.all([
      client.achievement.findMany({ where: { deleted: false }, orderBy: { createdAt: "asc" } }),
      client.quest.findMany({ orderBy: { createdAt: "desc" } }),
      client.pointLedger.aggregate({ where: { entryType: "earn" }, _sum: { amount: true } }),
      client.achievement.aggregate({ _sum: { awardedXp: true } }),
    ]);
    return {
      achievements: achievements.map(({ earnedAt, ...achievement }) => ({
        ...achievement,
        earnedAt: earnedAt?.toISOString() ?? null,
      })),
      quests: quests.map(({ completedAt, ...quest }) => ({
        ...quest,
        completedAt: completedAt?.toISOString() ?? null,
      })),
      totalXp: (taskXp._sum.amount ?? 0) + (achievementXp._sum.awardedXp ?? 0),
      newlyEarned,
      plannerDays,
    };
  });
}

export async function saveAchievement(id: string | null, input: AchievementInput) {
  if (id) throw new Error("Existing achievements cannot be edited.");
  return serializableTransaction(async (client) => {
    await client.achievement.create({ data: {
      ...input, milestoneInterval: input.tracking === "streak" ? input.target : null,
    } });
    return refreshAchievements(client, dateKey(new Date()));
  });
}

export async function createQuest(input: {
  title: string; description: string; kind: string; tier: string; points: number;
}) {
  await getDatabase().quest.create({ data: input });
}

export async function completeQuest(id: string) {
  return serializableTransaction(async (client) => {
    const quest = await client.quest.findUnique({ where: { id } });
    if (!quest) throw new Error("That quest no longer exists.");
    if (quest.completedAt) throw new Error("That quest is already complete.");
    await client.quest.update({ where: { id }, data: { completedAt: new Date() } });
    await awardTaskPoints(client, `quest:${id}`, dateKey(new Date()), quest.points);
  });
}

export async function deleteQuest(id: string) {
  const result = await getDatabase().quest.deleteMany({ where: { id } });
  if (result.count !== 1) throw new Error("That quest no longer exists.");
}
