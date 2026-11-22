import { useFetcher } from "react-router";
import {
  ArrowUpRight,
  BookOpen,
  Clapperboard,
  Cookie,
  Gamepad2,
  Heart,
  MapPin,
  Paintbrush,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Tv,
  Utensils,
} from "lucide-react";
import type { PlannerActionResult } from "../../../shared/planner/types";
import { rewards } from "../../../shared/planner/definitions";

const rewardIcons = {
  snacks: Cookie,
  "game-time": Gamepad2,
  "tv-time": Tv,
  "scroll-time": Smartphone,
  "small-treat": ShoppingBag,
  takeout: Utensils,
  paint: Paintbrush,
  "self-care": Heart,
  "movie-night": Clapperboard,
  "planner-supplies": BookOpen,
  "day-trip": MapPin,
  stickers: Sparkles,
} as const;

type RewardRedemption = {
  rewardId: string;
  rewardName: string;
  amount: number;
  createdAt: string;
};

type RewardShopProps = {
  balance: number;
  redemptions: readonly RewardRedemption[];
};

export function RewardShop({ balance, redemptions }: RewardShopProps) {
  const fetcher = useFetcher<PlannerActionResult>();

  return (
    <section className="panel rewards-panel">
      <div className="section-label">
        <span>04 / REWARDS</span>
        <Sparkles aria-hidden="true" size={12} />
      </div>
      <h2>Celebrate the wins.</h2>
      <p>Spend points you have earned. Reopening tasks never refunds rewards.</p>
      <div className="reward-list">
        {rewards.map((reward) => {
          const Icon = rewardIcons[reward.id];
          return (
            <fetcher.Form
              key={reward.id}
              method="post"
              className="reward-form"
              onSubmit={(event) => {
                if (
                  !window.confirm(
                    `Redeem ${reward.title} for ${reward.cost} points? This purchase cannot be refunded.`,
                  )
                ) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value="redeem_reward" />
              <input type="hidden" name="rewardId" value={reward.id} />
              <button
                className="reward-card"
                type="submit"
                disabled={
                  balance < reward.cost || fetcher.state !== "idle"
                }
              >
                <span>
                  <Icon aria-hidden="true" size={16} />
                </span>
                <strong>{reward.title}</strong>
                <small>{reward.cost} PTS</small>
              </button>
            </fetcher.Form>
          );
        })}
      </div>
      <div className="reward-note">
        {fetcher.data?.message ?? "PICK A REWARD THAT FEELS GOOD"}{" "}
        <ArrowUpRight aria-hidden="true" size={12} />
      </div>
      {fetcher.data?.error && (
        <p className="inline-error" role="alert">
          {fetcher.data.error}
        </p>
      )}
      {redemptions.length > 0 && (
        <div className="redemption-history">
          <strong>RECENT REWARDS</strong>
          {redemptions.map((item, index) => (
            <p key={`${item.rewardId}-${item.createdAt}-${index}`}>
              {item.rewardName} · {item.amount} pts
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
