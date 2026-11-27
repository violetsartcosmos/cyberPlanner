import { RewardShop } from "@/features/shop/components/shop";
import { usePlannerContext } from "@/features/planner/hooks/planner-context";
import { useLoaderData } from "react-router";
import { rewardsLoader } from "@/features/planner/services/gamification-actions";

export default function RewardsRoute() {
  const data = useLoaderData<typeof rewardsLoader>();
  const { selected } = usePlannerContext();
  return (
    <div className="row">
      <div className="col-12">
        <RewardShop
          balance={data.balance}
          selected={selected}
          redemptions={data.redemptions}
        />
      </div>
    </div>
  );
}
