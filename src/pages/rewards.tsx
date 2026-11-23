import { RewardShop } from "@/features/shop/components/shop";
import { usePlannerContext } from "@/features/planner/hooks/planner-context";

export default function RewardsRoute() {
  const { page, selected } = usePlannerContext();
  return (
    <div className="row justify-content-center">
      <div className="col-12 col-lg-10 col-xl-8">
        <RewardShop
          balance={page.balance}
          selected={selected}
          redemptions={page.redemptions}
        />
      </div>
    </div>
  );
}
