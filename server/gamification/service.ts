import type { Prisma } from "../generated/prisma/client";
import { dateString, getDatabase, serializableTransaction } from "../db/client";
import { awardTaskPoints } from "../points/service";
import { loadRoutines, routineId } from "../routines/definitions";
import { streaks } from "../../shared/planner/profile";
import { dateKey, dayProgress, parseDate } from "../../shared/planner/utils";

export type AchievementInput = {
  title: string;
  description: string;
  category: string;
  tier: string;
  xp: number;
  target: number;
  tracking: "points" | "streak";
  taskId?: string | null;
  reward?: string;
};

export type QuestInput = {
  title: string;
  description: string;
  kind: string;
  tier: string;
  points: number;
};

type RoutineCompletion = { day: Date; taskId: number };

export async function refreshAchievements(client: Prisma.TransactionClient, today: string, completions?: RoutineCompletion[]) {
  const [achievements, checks, taskPoints] = await Promise.all([
    client.achievement.findMany({ where: { deleted: false } }),
    completions ?? client.routineTaskCompletion.findMany(),
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
      const routines = hasActivityStreak ? (await loadRoutines(client)).routines : [];
      const checksByDate = new Map<string, string[]>();
      for (const check of checks) {
        const date = dateString(check.day);
        const taskId = String(check.taskId);
        taskDates.get(taskId)?.push(date);
        if (!checksByDate.has(date)) checksByDate.set(date, []);
        checksByDate.get(date)!.push(taskId);
      }
      if (hasActivityStreak) {
        for (const [date, taskIds] of checksByDate) {
          if (dayProgress(parseDate(date), taskIds, routines).completed > 0) activityDates.push(date);
        }
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
    const completions = await client.routineTaskCompletion.findMany({ orderBy: [{ day: "asc" }, { taskId: "asc" }] });
    const newlyEarned = await refreshAchievements(client, today, completions);
    const [achievements, quests, taskXp, achievementXp, { routines, routineGroups }] = await Promise.all([
      client.achievement.findMany({ where: { deleted: false }, orderBy: { createdAt: "asc" } }),
      client.quest.findMany({ where: { deleted: false }, orderBy: { createdAt: "desc" } }),
      client.pointLedger.aggregate({ where: { entryType: "earn" }, _sum: { amount: true } }),
      client.achievement.aggregate({ _sum: { awardedXp: true } }),
      loadRoutines(client),
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
      completions,
      routines,
      routineGroups,
    };
  });
}

export async function saveAchievement(id: string | null, input: AchievementInput) {
  if (id) throw new Error("Existing achievements cannot be edited.");
  return serializableTransaction(async (client) => {
    const tracking = input.tracking.trim();
    const taskId = tracking === "streak" ? input.taskId?.trim() ?? null : null;
    if (tracking === "streak") {
      const id = taskId && routineId(taskId);
      if (!id || !(await client.routineTask.findFirst({ where: { id, list: { in: ["morning", "night"] } } }))) {
        throw new Error("Choose a valid routine task.");
      }
    }
    const achievement = await client.achievement.create({ data: {
      title: input.title.trim(), description: input.description.trim(),
      category: input.category.trim(), tier: input.tier.trim(),
      xp: input.xp, target: input.target, tracking,
      taskId, reward: (input.reward ?? "").trim(),
      milestoneInterval: tracking === "streak" ? input.target : null,
    } });
    // A new achievement may already be earned. Refresh and reread it so the
    // response includes its current progress and awarded XP.
    const earnedAchievements = await refreshAchievements(client, dateKey(new Date()));
    const saved = await client.achievement.findUniqueOrThrow({ where: { id: achievement.id } });
    return { achievement: saved, earnedAchievements };
  });
}

/**
 * Builds the profile's completion history, achievement progress, and XP total.
 * @param today - The date used to refresh date-dependent achievement progress.
 * @returns The profile resources without quests or selected-date task state.
 */
export async function getProfileSummary(today: string) {
  return serializableTransaction(async (client) => {
    const completions = await client.routineTaskCompletion.findMany({
      orderBy: [{ day: "asc" }, { taskId: "asc" }],
    });
    await refreshAchievements(client, today, completions);
    const [achievements, taskXp, achievementXp, { routines }] = await Promise.all([
      client.achievement.findMany({ where: { deleted: false }, orderBy: { createdAt: "asc" } }),
      client.pointLedger.aggregate({ where: { entryType: "earn" }, _sum: { amount: true } }),
      client.achievement.aggregate({ _sum: { awardedXp: true } }),
      loadRoutines(client),
    ]);
    const checks: Record<string, string[]> = {};
    for (const completion of completions) {
      const date = dateString(completion.day);
      (checks[date] ??= []).push(String(completion.taskId));
    }
    return {
      checks,
      routines,
      achievements: achievements.map(({ earnedAt, ...achievement }) => ({
        ...achievement,
        earnedAt: earnedAt?.toISOString() ?? null,
      })),
      totalXp: (taskXp._sum.amount ?? 0) + (achievementXp._sum.awardedXp ?? 0),
    };
  });
}

// These reads supply individual resource endpoints without assembling the
// larger planner page. Deleted quests and achievements stay hidden.
export async function listQuests() {
  return getDatabase().quest.findMany({ where: { deleted: false }, orderBy: { createdAt: "desc" } });
}

export async function listAchievements() {
  return getDatabase().achievement.findMany({ where: { deleted: false }, orderBy: { createdAt: "asc" } });
}

/**
 * Lists available quest templates in their display order.
 * @returns Quest templates grouped by track and position.
 */
export async function listQuestTemplates() {
  return getDatabase().questTemplate.findMany({ orderBy: [{ track: "asc" }, { position: "asc" }] });
}

/**
 * Lists template IDs already accepted by the signed-in user.
 * @returns Accepted quest-template IDs for quest-log filtering.
 */
export async function listAcceptedTemplateIds() {
  const quests = await getDatabase().quest.findMany({
    where: { templateId: { not: null } },
    select: { templateId: true },
  });
  return quests.flatMap(({ templateId }) => templateId === null ? [] : [templateId]);
}

export async function getQuest(id: string) {
  return getDatabase().quest.findFirst({ where: { id, deleted: false } });
}

export async function createQuest(input: QuestInput) {
  return getDatabase().quest.create({ data: {
    title: input.title.trim(), description: input.description.trim(), kind: input.kind.trim(),
    tier: input.tier.trim(), points: input.points,
  } });
}

// A partial input updates only the fields supplied by PATCH. Check the quest
// and update it in one serializable transaction so deleted quests cannot be edited.
export async function updateQuest(id: string, input: Partial<QuestInput>) {
  const changes: Partial<QuestInput> = {};
  if (input.title !== undefined) changes.title = input.title.trim();
  if (input.description !== undefined) changes.description = input.description.trim();
  if (input.kind !== undefined) changes.kind = input.kind.trim();
  if (input.tier !== undefined) changes.tier = input.tier.trim();
  if (input.points !== undefined) changes.points = input.points;
  if (!Object.keys(changes).length) throw new Error("Provide at least one quest field.");
  return serializableTransaction(async (client) => {
    const quest = await client.quest.findUnique({ where: { id } });
    if (!quest || quest.deleted) throw new Error("That quest no longer exists.");
    return client.quest.update({ where: { id }, data: changes });
  });
}

export async function acceptTemplate(templateId: string) {
  return serializableTransaction(async (client) => {
    const template = await client.questTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new Error("That quest template no longer exists.");
    const existing = await client.quest.findUnique({ where: { templateId } });
    if (existing) throw new Error("That quest is already in your quest list.");
    await client.quest.create({ data: {
      templateId,
      title: template.title,
      description: template.description,
      kind: template.kind,
      tier: template.tier,
      points: template.points,
    } });
  });
}

export async function completeQuest(id: string) {
  return serializableTransaction(async (client) => {
    const quest = await client.quest.findUnique({ where: { id } });
    if (!quest || quest.deleted) throw new Error("That quest no longer exists.");
    if (quest.completedAt) throw new Error("That quest is already complete.");
    await client.quest.update({ where: { id }, data: { completedAt: new Date() } });
    await awardTaskPoints(client, `quest:${id}`, dateKey(new Date()), quest.points);
  });
}

export async function deleteQuest(id: string) {
  const result = await getDatabase().quest.updateMany({ where: { id, deleted: false }, data: { deleted: true } });
  if (result.count !== 1) throw new Error("That quest no longer exists.");
}
