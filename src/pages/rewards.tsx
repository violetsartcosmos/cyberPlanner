import { RewardShop } from "@/features/shop/components/shop";
import { usePlannerContext } from "@/features/planner/hooks/planner-context";

export default function RewardsRoute() {
  const { page, selected } = usePlannerContext();
  return (
    <div className="dashboard-grid">
      <aside className="left-column" />
      <div className="main-column" />
      <aside className="right-column">
        <RewardShop
          balance={page.balance}
          selected={selected}
          redemptions={page.redemptions}
        />
      </aside>
    </div>
  );
}
