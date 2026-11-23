import { morningRoutine, nightRoutine } from "../../shared/planner/definitions";
import { achievementCategories, questKinds, tiers } from "../../shared/planner/gamification";
import type { ActionHandler } from "../planner/dispatch";
import {
  completeQuest, createQuest, deleteQuest, saveAchievement,
} from "./service";

function text(form: FormData, name: string, max: number, required = true) {
  const value = form.get(name);
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) {
    throw new Error(`Enter a valid ${name} (up to ${max} characters).`);
  }
  return value.trim();
}

function positiveNumber(form: FormData, name: string, max: number) {
  const value = text(form, name, 10);
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) {
    throw new Error(`${name} must be a whole number between 1 and ${max}.`);
  }
  return Number(value);
}

function choice(form: FormData, name: string, options: readonly string[]) {
  const value = text(form, name, 100);
  if (!options.includes(value)) throw new Error(`Choose a valid ${name}.`);
  return value;
}

export const gamificationActions = {
  async save_achievement(form) {
    const id = text(form, "id", 100, false);
    const title = text(form, "title", 100);
    const description = text(form, "description", 500);
    const category = choice(form, "category", achievementCategories);
    const tier = choice(form, "tier", tiers);
    const xp = positiveNumber(form, "xp", 100_000);
    const target = positiveNumber(form, "target", 3_650);
    const tracking = choice(form, "tracking", ["points", "streak"]);
    if (tracking !== "points" && tracking !== "streak") throw new Error("Choose a valid tracking method.");
    const taskId = tracking === "streak" ? text(form, "taskId", 100) : null;
    const routineIds = [
      ...morningRoutine.map((_, index) => `morning-${index}`),
      ...nightRoutine.map((_, index) => `night-${index}`),
    ];
    if (taskId !== null && !routineIds.includes(taskId)) throw new Error("Choose a valid routine task.");
    const reward = text(form, "reward", 200, false);
    const earnedAchievements = await saveAchievement(id || null, {
      title, description, category, tier, xp, target, tracking, taskId, reward,
    });
    return { ok: true, message: "Achievement saved.", earnedAchievements };
  },
  async create_quest(form) {
    await createQuest({
      title: text(form, "title", 100),
      description: text(form, "description", 500, false),
      kind: choice(form, "kind", questKinds),
      tier: choice(form, "tier", tiers),
      points: positiveNumber(form, "points", 100_000),
    });
    return { ok: true, message: "Quest created." };
  },
  async complete_quest(form) {
    await completeQuest(text(form, "id", 100));
    return { ok: true, message: "Quest complete! Points and XP earned." };
  },
  async delete_quest(form) {
    await deleteQuest(text(form, "id", 100));
    return { ok: true, message: "Quest deleted. Earned points and XP are kept." };
  },
} satisfies Record<string, ActionHandler>;
