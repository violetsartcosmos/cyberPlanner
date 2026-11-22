import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useFetcher } from "react-router";
import {
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

const rewardDescriptions: Record<(typeof rewards)[number]["id"], string> = {
  snacks: "A little something delicious for your next break.",
  "game-time": "Make room for an adventure of your own.",
  "tv-time": "Settle in with something you love to watch.",
  "scroll-time": "Take a guilt-free scroll break.",
  "small-treat": "Choose a little something just for you.",
  takeout: "Let someone else handle the cooking tonight.",
  paint: "Make time to play with color.",
  "self-care": "A gentle moment to recharge.",
  "movie-night": "Pick a movie and make an evening of it.",
  "planner-supplies": "Add something special to your planner.",
  "day-trip": "Head somewhere new for a change of scenery.",
  stickers: "A little extra sparkle for your collection.",
};

type RewardRedemption = {
  rewardId: string;
  rewardName: string;
  amount: number;
  createdAt: string;
};

type RewardShopProps = {
  balance: number;
  selected: string;
  redemptions: readonly RewardRedemption[];
};

export function RewardShop({ balance, selected, redemptions }: RewardShopProps) {
  const fetcher = useFetcher<PlannerActionResult>();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const reward = rewards[selectedIndex];
  const SelectedIcon = rewardIcons[reward.id];
  const canAfford = balance >= reward.cost;

  function selectReward(index: number) {
    setSelectedIndex(index);
  }

  function createRewardSelectionHandler(index: number) {
    return function handleRewardSelection() {
      selectReward(index);
    };
  }

  const rewardItems: ReactNode[] = [];
  for (let index = 0; index < rewards.length; index += 1) {
    const item = rewards[index];
    const Icon = rewardIcons[item.id];
    rewardItems.push(
      <button
        key={item.id}
        className="shop-item"
        type="button"
        aria-pressed={selectedIndex === index}
        onClick={createRewardSelectionHandler(index)}
      >
        <Icon aria-hidden="true" size={28} />
        <strong>{item.title}</strong>
        <small>{item.cost} PTS</small>
      </button>,
    );
  }

  const redemptionHistory: ReactNode[] = [];
  for (let index = 0; index < redemptions.length; index += 1) {
    const item = redemptions[index];
    redemptionHistory.push(
      <p key={`${item.rewardId}-${item.createdAt}-${index}`}>
        {item.rewardName} · {item.amount} pts
      </p>,
    );
  }

  function confirmRedemption(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Redeem ${reward.title} for ${reward.cost} points? This purchase cannot be refunded.`)) {
      event.preventDefault();
    }
  }

  return (
    <section className="shop" aria-labelledby="shop-heading">
      <header className="shop-header">
        <div>
          <p className="eyebrow">NYX'S LITTLE SHOP OF WINS</p>
          <h2 id="shop-heading">Reward inventory</h2>
        </div>
        <span className="shop-balance"><Sparkles aria-hidden="true" size={15} /> {balance} PTS</span>
      </header>
      <div className="shop-layout">
        <div className="shop-inventory">
          <div className="shop-inventory-heading">
            <h3 id="inventory-heading">Choose an item</h3>
            <span>{rewards.length} REWARDS</span>
          </div>
          <div className="shop-items" role="group" aria-labelledby="inventory-heading">
            {rewardItems}
          </div>
        </div>
        <div className="shop-preview">
          <img
            src="/shopkeeperv2.jpg"
            alt="Pixel art of Nyx welcoming you from behind her shop counter."
          />
          <div className="shop-detail" aria-live="polite">
            <p className="eyebrow">NYX'S PICK / {reward.cost} PTS</p>
            <h3><SelectedIcon aria-hidden="true" size={21} /> {reward.title}</h3>
            <p>{rewardDescriptions[reward.id]}</p>
            {!canAfford && <p className="shop-shortfall">You need {reward.cost - balance} more points.</p>}
            <fetcher.Form
              method="post"
              onSubmit={confirmRedemption}
            >
              <input type="hidden" name="intent" value="redeem_reward" />
              <input type="hidden" name="rewardId" value={reward.id} />
              <input type="hidden" name="date" value={selected} />
              <button className="shop-purchase" type="submit" disabled={!canAfford || fetcher.state !== "idle"}>
                {fetcher.state === "idle" ? `REDEEM / ${reward.cost} PTS` : "REDEEMING..."}
              </button>
            </fetcher.Form>
          </div>
        </div>
      </div>
      <div className="shop-footer">
        {fetcher.data?.message && <p className="shop-feedback" role="status">{fetcher.data.message}</p>}
        {fetcher.data?.error && <p className="inline-error" role="alert">{fetcher.data.error}</p>}
        {redemptions.length > 0 && (
          <div className="redemption-history">
            <strong>RECENT REWARDS</strong>
            {redemptionHistory}
          </div>
        )}
      </div>
    </section>
  );
}
