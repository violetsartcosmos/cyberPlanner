import { QuestLog } from "@/features/planner/components/quest-log";
import { usePlannerContext } from "@/features/planner/hooks/planner-context";
import { useLoaderData } from "react-router";
import { questLogLoader } from "@/features/planner/services/quest-log-route";

export default function QuestLogRoute() {
  const { selected } = usePlannerContext();
  const questLog = useLoaderData<typeof questLogLoader>();
  return (
    <QuestLog
      routines={questLog.routines}
      routineGroups={questLog.routineGroups}
      templates={questLog.templates}
      acceptedTemplateIds={questLog.acceptedTemplateIds}
      selected={selected}
    />
  );
}
