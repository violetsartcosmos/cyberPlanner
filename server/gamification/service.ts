import type { Prisma } from "../generated/prisma/client";
import { dateString, getDatabase, serializableTransaction } from "../db/client";
import { awardTaskPoints } from "../points/service";
import { streaks } from "../../shared/planner/profile";
import { dateKey } from "../../shared/planner/utils";

type AchievementInput = {
  title: string;
  description: string;
  category: string;
  tier: string;
  xp: number;
  target: number;
  tracking: "manual" | "streak";
  taskId: string | null;
  reward: string;
};

export async function refreshStreakAchievements(client: Prisma.TransactionClient, today: string) {
  const [achievements, days] = await Promise.all([
    client.achievement.findMany({ where: { tracking: "streak", deleted: false, unlockedAt: null } }),
    client.plannerDay.findMany({ select: { day: true, checks: true } }),
  ]);
  const unlocked: string[] = [];
  for (const achievement of achievements) {
    const dates = days.filter((day) => {
      if (!Array.isArray(day.checks) || !day.checks.every((item) => typeof item === "string")) {
        throw new Error("Stored planner checks are invalid.");
      }
      return achievement.taskId !== null && day.checks.includes(achievement.taskId);
    }).map((day) => dateString(day.day));
    const result = streaks(dates, today);
    const earned = result.best >= achievement.target;
    const current = earned ? achievement.target : Math.min(result.current, achievement.target);
    if (earned || current !== achievement.current) {
      await client.achievement.update({
        where: { id: achievement.id },
        data: earned
          ? { current, unlockedAt: new Date(), awardedXp: achievement.xp }
          : { current },
      });
      if (earned) unlocked.push(achievement.title);
    }
  }
  return unlocked;
}

export async function getGamification(today: string) {
  return serializableTransaction(async (client) => {
    const newlyUnlocked = await refreshStreakAchievements(client, today);
    const [achievements, quests, taskXp, achievementXp] = await Promise.all([
      client.achievement.findMany({ where: { deleted: false }, orderBy: { createdAt: "asc" } }),
      client.quest.findMany({ orderBy: { createdAt: "desc" } }),
      client.pointLedger.aggregate({ where: { entryType: "earn" }, _sum: { amount: true } }),
      client.achievement.aggregate({ _sum: { awardedXp: true } }),
    ]);
    return {
      achievements: achievements.map(({ unlockedAt, ...achievement }) => ({
        ...achievement,
        unlockedAt: unlockedAt?.toISOString() ?? null,
      })),
      quests: quests.map(({ completedAt, ...quest }) => ({
        ...quest,
        completedAt: completedAt?.toISOString() ?? null,
      })),
      totalXp: (taskXp._sum.amount ?? 0) + (achievementXp._sum.awardedXp ?? 0),
      newlyUnlocked,
    };
  });
}

export async function saveAchievement(id: string | null, input: AchievementInput) {
  return serializableTransaction(async (client) => {
    if (!id) {
      await client.achievement.create({ data: input });
    } else {
      const existing = await client.achievement.findFirst({ where: { id, deleted: false } });
      if (!existing) throw new Error("That achievement no longer exists.");
      const changedTracking = existing.tracking !== input.tracking || existing.taskId !== input.taskId;
      const current = existing.unlockedAt
        ? input.target
        : Math.min(changedTracking ? 0 : existing.current, input.target);
      const earned = !existing.unlockedAt && input.tracking === "manual" && current >= input.target;
      await client.achievement.update({
        where: { id },
        data: {
          ...input, current,
          ...(earned ? { unlockedAt: new Date(), awardedXp: input.xp } : {}),
        },
      });
      if (earned) return [input.title];
    }
    return refreshStreakAchievements(client, dateKey(new Date()));
  });
}

export async function advanceAchievement(id: string) {
  return serializableTransaction(async (client) => {
    const achievement = await client.achievement.findFirst({ where: { id, deleted: false } });
    if (!achievement) throw new Error("That achievement no longer exists.");
    if (achievement.tracking !== "manual") throw new Error("This achievement is tracked from your routine.");
    if (achievement.unlockedAt) throw new Error("That achievement is already unlocked.");
    const current = Math.min(achievement.current + 1, achievement.target);
    const earned = current === achievement.target;
    await client.achievement.update({
      where: { id },
      data: { current, ...(earned ? { unlockedAt: new Date(), awardedXp: achievement.xp } : {}) },
    });
    return earned ? [achievement.title] : [];
  });
}

export async function deleteAchievement(id: string) {
  const result = await getDatabase().achievement.updateMany({
    where: { id, deleted: false },
    data: { deleted: true },
  });
  if (result.count !== 1) throw new Error("That achievement no longer exists.");
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
