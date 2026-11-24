import { QuestLog } from "@/features/planner/components/quest-log";
import { usePlannerContext } from "@/features/planner/hooks/planner-context";

export default function QuestLogRoute() {
  const { page, selected } = usePlannerContext();
  return (
    <QuestLog
      routines={page.routines}
      routineGroups={page.routineGroups}
      templates={page.questTemplates}
      acceptedTemplateIds={page.acceptedTemplateIds}
      selected={selected}
    />
  );
}
