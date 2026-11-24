import { Profile } from "@/features/planner/components/profile";
import { usePlannerContext } from "@/features/planner/hooks/planner-context";

export default function ProfileRoute() {
  const { page, selected, today } = usePlannerContext();
  return (
    <Profile
      checks={page.checks}
      routines={page.routines}
      selected={selected}
      today={today}
      balance={page.balance}
      totalXp={page.totalXp}
      achievements={page.achievements}
    />
  );
}
