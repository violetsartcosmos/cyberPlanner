import { QuestBoard } from "@/features/planner/components/quest-board";
import { usePlannerContext } from "@/features/planner/hooks/planner-context";
import { useLoaderData } from "react-router";
import { questBoardLoader } from "@/features/planner/services/quest-actions";

export default function QuestBoardRoute() {
  const quests = useLoaderData<typeof questBoardLoader>();
  const { selected } = usePlannerContext();
  return <QuestBoard quests={quests} selected={selected} />;
}
