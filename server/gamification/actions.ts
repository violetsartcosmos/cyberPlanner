import type { ActionHandler } from "../planner/dispatch";
import { acceptTemplate, completeQuest, createQuest, deleteQuest, saveAchievement, updateQuest, type QuestInput } from "./service";

function questFormValues(form: FormData): QuestInput {
  return {
    title: form.get("title") as string,
    description: form.get("description") as string,
    kind: form.get("kind") as string,
    tier: form.get("tier") as string,
    points: Number(form.get("points")),
  };
}

export const gamificationActions = {
  async save_achievement(form) {
    const tracking = form.get("tracking") as "points" | "streak";
    const { earnedAchievements } = await saveAchievement(form.get("id") as string, {
      title: form.get("title") as string, description: form.get("description") as string,
      category: form.get("category") as string, tier: form.get("tier") as string,
      xp: Number(form.get("xp")), target: Number(form.get("target")), tracking,
      taskId: form.get("taskId") as string | null, reward: form.get("reward") as string,
    });
    return { ok: true, message: "Achievement saved.", earnedAchievements };
  },
  async create_quest(form) { await createQuest(questFormValues(form)); return { ok: true, message: "Quest created." }; },
  async update_quest(form) { await updateQuest(form.get("id") as string, questFormValues(form)); return { ok: true, message: "Quest updated." }; },
  async accept_template(form) { await acceptTemplate(form.get("templateId") as string); return { ok: true, message: "Quest accepted." }; },
  async complete_quest(form) { await completeQuest(form.get("id") as string); return { ok: true, message: "Quest complete." }; },
  async delete_quest(form) { await deleteQuest(form.get("id") as string); return { ok: true, message: "Quest deleted." }; },
} satisfies Record<string, ActionHandler>;
