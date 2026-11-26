import { Hono } from "hono";
import { isValidDateKey } from "../../shared/planner/utils";
import { rewards } from "../../shared/planner/definitions";
import { noStore, reportServerError, requireSignIn } from "../http";
import { getPointsSummary, redeemReward } from "./service";

export const pointsRoutes = new Hono();

pointsRoutes.get("/points", noStore, requireSignIn, async (context) => {
  const date = context.req.query("date");
  if (!date || !isValidDateKey(date)) return context.json({ error: "That planner date is invalid." }, 400);
  try {
    return context.json(await getPointsSummary(date));
  } catch (error) {
    return reportServerError(context, error, "Could not load points.");
  }
});

pointsRoutes.get("/rewards", noStore, requireSignIn, (context) => context.json(rewards));

pointsRoutes.post("/rewards/:id/redemptions", noStore, requireSignIn, async (context) => {
  const reward = rewards.find((item) => item.id === context.req.param("id"));
  if (!reward) return context.json({ error: "That reward is not available." }, 404);
  try {
    const result = await redeemReward({ id: reward.id, name: reward.title, cost: reward.cost });
    if (!result.redeemed) {
      return context.json({ error: `You need ${reward.cost - result.balance} more points for ${reward.title}.` }, 409);
    }
    return context.json({ rewardId: reward.id, balance: result.balance }, 201);
  } catch (error) {
    return reportServerError(context, error, "Could not redeem reward.");
  }
});
