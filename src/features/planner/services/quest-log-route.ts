import type { LoaderFunctionArgs } from "react-router";
import type { QuestTemplate } from "../../../../shared/planner/gamification";
import type { RoutineGroup, RoutineTask } from "../../../../shared/planner/routines";

export type QuestLogReadResult = {
  routines: RoutineTask[];
  routineGroups: RoutineGroup[];
  templates: QuestTemplate[];
  acceptedTemplateIds: string[];
};

/**
 * Loads the routines, suggestions, and acceptance history owned by the quest log.
 * @param args - The cancellable quest-log loader request.
 * @returns The resources required to render the quest log.
 */
export async function questLogLoader({ request }: LoaderFunctionArgs): Promise<QuestLogReadResult> {
  const [routinesResponse, templatesResponse, acceptedResponse] = await Promise.all([
    fetch("/api/routines", { signal: request.signal }),
    fetch("/api/quest-templates", { signal: request.signal }),
    fetch("/api/quest-templates/accepted", { signal: request.signal }),
  ]);
  if (!routinesResponse.ok) throw new Error(`Could not load routines (${routinesResponse.status}).`);
  if (!templatesResponse.ok) throw new Error(`Could not load quest templates (${templatesResponse.status}).`);
  if (!acceptedResponse.ok) throw new Error(`Could not load accepted quest templates (${acceptedResponse.status}).`);
  const routines = await routinesResponse.json() as { routines: RoutineTask[]; routineGroups: RoutineGroup[] };
  const templates = await templatesResponse.json() as QuestTemplate[];
  const accepted = await acceptedResponse.json() as { templateIds: string[] };
  return {
    routines: routines.routines,
    routineGroups: routines.routineGroups,
    templates,
    acceptedTemplateIds: accepted.templateIds,
  };
}
