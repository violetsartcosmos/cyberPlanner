import { QuestBoard } from "@/features/planner/components/quest-board";
import { usePlannerContext } from "@/features/planner/hooks/planner-context";

export default function QuestBoardRoute() {
  const { page, selected } = usePlannerContext();
  return <QuestBoard quests={page.quests} selected={selected} />;
}
