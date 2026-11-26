import { Profile } from "@/features/planner/components/profile";
import { usePlannerContext } from "@/features/planner/hooks/planner-context";
import { useLoaderData } from "react-router";
import { profileLoader } from "@/features/planner/services/profile-route";

export default function ProfileRoute() {
  const { today } = usePlannerContext();
  const profile = useLoaderData<typeof profileLoader>();
  return (
    <Profile
      checks={profile.checks}
      routines={profile.routines}
      today={today}
      totalXp={profile.totalXp}
      achievements={profile.achievements}
    />
  );
}
