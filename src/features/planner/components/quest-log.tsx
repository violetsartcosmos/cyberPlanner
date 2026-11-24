import { useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { useFetcher } from "react-router";
import type { QuestTemplate } from "../../../../shared/planner/gamification";
import type { RoutineGroup, RoutineKind, RoutineTask } from "../../../../shared/planner/routines";
import { routineKinds, routinePoints } from "../../../../shared/planner/routines";
import type { PlannerActionResult } from "../../../../shared/planner/types";
import { useActionNotifications } from "@/components/notifications";

type FetcherType = ReturnType<typeof useFetcher<PlannerActionResult>>;

const kindSections = [
  { kind: "side", title: "Side Quests", detail: "Quick daily or weekly tasks" },
  { kind: "main", title: "Main Quests", detail: "Monthly or quarterly projects" },
  { kind: "boss", title: "End-Game Bosses", detail: "Major long-term goals" },
] as const;

const kindLabels: Record<RoutineKind, string> = {
  side: "Side Quest",
  main: "Main Quest",
  boss: "End-Game Boss",
};

const trackLabels: Record<string, string> = {
  cyber: "Cyber and software",
  life: "Life and career",
};

function routineLabel(routine: RoutineTask, groupTitle: string | undefined) {
  if (routine.list === "daily") return `${groupTitle ?? "Weekly"} · daily quest`;
  return routine.list === "morning" ? "Morning checklist" : "Night checklist";
}

export function QuestLog({
  routines,
  routineGroups,
  templates,
  acceptedTemplateIds,
  selected,
}: {
  routines: RoutineTask[];
  routineGroups: RoutineGroup[];
  templates: QuestTemplate[];
  acceptedTemplateIds: string[];
  selected: string;
}) {
  const fetcher = useFetcher<PlannerActionResult>();
  useActionNotifications(fetcher);
  const busy = fetcher.state !== "idle";

  const routinesByKind: Record<RoutineKind, RoutineTask[]> = { side: [], main: [], boss: [] };
  for (const routine of routines) routinesByKind[routine.kind].push(routine);

  const accepted = new Set(acceptedTemplateIds);

  const routineSections: ReactNode[] = [];
  for (const section of kindSections) {
    const cards: ReactNode[] = [];
    for (const routine of routinesByKind[section.kind]) {
      const groupTitle = routine.list === "daily"
        ? routineGroups.find((group) => group.weekday === routine.weekday)?.title
        : undefined;
      cards.push(
        <RoutineCard
          key={`${routine.list}-${routine.weekday}-${routine.slot}`}
          routine={routine}
          label={routineLabel(routine, groupTitle)}
          busy={busy}
          fetcher={fetcher}
        />,
      );
    }
    routineSections.push(
      <section className="quest-group" key={section.kind}>
        <div className="profile-section-heading">
          <div><p className="text-label accent">{section.detail}</p><h2>{section.title}</h2></div>
        </div>
        {cards.length ? cards : <p className="profile-note">No routines here yet.</p>}
      </section>,
    );
  }

  const trackGroups: ReactNode[] = [];
  for (const track of Object.keys(trackLabels)) {
    const trackTemplates = templates.filter((template) => template.track === track);
    const kindGroups: ReactNode[] = [];
    for (const section of kindSections) {
      const cards: ReactNode[] = [];
      for (const template of trackTemplates) {
        if (template.kind !== section.kind || accepted.has(template.id)) continue;
        cards.push(
          <article className="quest-card" key={template.id}>
            <div>
              <span className="text-label">{kindLabels[section.kind as RoutineKind]} · {template.points} PTS / XP</span>
              <h3>{template.title}</h3>
              {template.description && <p>{template.description}</p>}
            </div>
            <div className="quest-actions">
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="accept_template" />
                <input type="hidden" name="templateId" value={template.id} />
                <button className="btn btn-primary btn-sm" disabled={busy}>Accept</button>
              </fetcher.Form>
            </div>
          </article>,
        );
      }
      if (cards.length) {
        kindGroups.push(
          <div key={section.kind}>
            <p className="text-label accent">{section.title}</p>
            {cards}
          </div>,
        );
      }
    }
    trackGroups.push(
      <section className="quest-group" key={track}>
        <div className="profile-section-heading">
          <div><p className="text-label accent">Possible quests</p><h2>{trackLabels[track]}</h2></div>
        </div>
        {kindGroups.length ? kindGroups : <p className="profile-note">No suggestions here.</p>}
      </section>,
    );
  }

  return (
    <div className="quest-board quest-log">
      <p className="text-label accent">Selected day {selected}</p>
      <h2 className="quest-log-heading">Your routines</h2>
      <p className="profile-note">Routines stay on their checklist. Change a routine&apos;s type to change its points for the next check-off. Points already earned are kept.</p>
      {routineSections}
      <h2 className="quest-log-heading">Possible quests</h2>
      <p className="profile-note">Accept a quest to add it to Create Quest. Each suggestion can only be accepted once.</p>
      {trackGroups}
    </div>
  );
}

function RoutineCard({
  routine,
  label,
  busy,
  fetcher,
}: {
  routine: RoutineTask;
  label: string;
  busy: boolean;
  fetcher: FetcherType;
}) {
  const [kind, setKind] = useState<RoutineKind>(routine.kind);
  function handleKindChange(event: ChangeEvent<HTMLSelectElement>) {
    setKind(event.target.value as RoutineKind);
  }
  const changed = kind !== routine.kind;

  return (
    <article className="quest-card">
      <div>
        <span className="text-label">{label} · {routine.points} PTS</span>
        <h3>{routine.title}</h3>
      </div>
      <fetcher.Form method="post" className="quest-actions">
        <input type="hidden" name="intent" value="update_routine_kind" />
        <input type="hidden" name="list" value={routine.list} />
        <input type="hidden" name="weekday" value={routine.weekday} />
        <input type="hidden" name="slot" value={routine.slot} />
        <select className="form-select form-select-sm" name="kind" value={kind} onChange={handleKindChange} aria-label={`Type for ${routine.title}`}>
          {routineKinds.map((item) => (
            <option key={item} value={item}>{kindLabels[item]} · {routinePoints[item]} pts</option>
          ))}
        </select>
        <button className="btn btn-outline-secondary btn-sm" disabled={busy || !changed}>Save type</button>
      </fetcher.Form>
    </article>
  );
}
