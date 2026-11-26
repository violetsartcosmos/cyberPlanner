import type { ActionFunctionArgs } from "react-router";
import type { AchievementActionResult, QuestActionResult } from "../../../../shared/planner/types";

/**
 * Creates an achievement submitted to POST /profile/achievements.
 * @param args - The action request containing the achievement fields.
 * @returns The HTTP status and save notification or API error.
 */
export async function createAchievementAction({ request }: ActionFunctionArgs): Promise<AchievementActionResult> {
  const form = await request.formData();
  const tracking = form.get("tracking");
  const response = await fetch("/api/achievements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: form.get("title"),
      description: form.get("description"),
      category: form.get("category"),
      tier: form.get("tier"),
      xp: Number(form.get("xp")),
      target: Number(form.get("target")),
      tracking,
      taskId: tracking === "streak" ? form.get("taskId") : null,
      reward: form.get("reward"),
    }),
    signal: request.signal,
  });
  if (response.status < 200 || response.status >= 300) {
    return { status: response.status, error: (await response.json() as { error: string }).error };
  }
  const { earnedAchievements } = await response.json() as { earnedAchievements: string[] };
  return { status: response.status, message: "Achievement created.", earnedAchievements };
}

/**
 * Redeems a reward submitted to POST /rewards/:id/redemptions.
 * @param args - The action request and reward ID route parameter.
 * @returns The HTTP status and redemption notification or API error.
 */
export async function redeemRewardAction({ request, params }: ActionFunctionArgs): Promise<QuestActionResult> {
  const response = await fetch(`/api/rewards/${encodeURIComponent(params.id as string)}/redemptions`, {
    method: "POST",
    signal: request.signal,
  });
  if (response.status < 200 || response.status >= 300) {
    return { status: response.status, error: (await response.json() as { error: string }).error };
  }
  return { status: response.status, message: "Reward redeemed." };
}
