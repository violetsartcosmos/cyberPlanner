import { rewards } from "../../shared/planner/definitions";
import type { ActionHandler } from "../planner/dispatch";
import { redeemReward } from "./service";

export const pointsFormActions = {
  async redeem_reward(form) {
    const rewardId = form.get("rewardId");
    const reward = rewards.find((item) => item.id === rewardId);
    if (!reward) return { ok: false, error: "That reward is not available." };
    const result = await redeemReward({ id: reward.id, name: reward.title, cost: reward.cost });
    if (!result.redeemed) return { ok: false, error: `You need ${reward.cost - result.balance} more points for ${reward.title}.` };
    return { ok: true, message: `${reward.title} redeemed for ${reward.cost} points.` };
  },
} satisfies Record<string, ActionHandler>;
