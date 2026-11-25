import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Moon, RefreshCw, Sparkles, Sun } from "lucide-react";
import type { ExternalTask } from "../../../../shared/planner/types";
import { externalTaskId } from "../../../../shared/planner/utils";
import { routineGroupFor, routinesFor, routineWeekday } from "../../../../shared/planner/routines";
import type { RoutineGroup, RoutineTask } from "../../../../shared/planner/routines";
import { Checklist } from "./checklist";
import witchyHappy from "@/assets/images/witchyhappy.png";

type TaskSectionProps = {
  kind: "daily" | "routines" | "synced";
  selected: string;
  checked: string[];
  earnedTaskKeys: string[];
  disabled: boolean;
  onToggle: (id: string) => void;
  routines: RoutineTask[];
  routineGroups: RoutineGroup[];
  weekday?: number;
  tasks?: readonly ExternalTask[];
  illustrated?: boolean;
};

function getRoutineTitles(routines: readonly RoutineTask[]) {
  return routines.map((routine) => routine.title);
}

function getRoutinePoints(routines: readonly RoutineTask[]) {
  return routines.map((routine) => routine.points);
}

type Routine = "morning" | "night";

function getInitialRoutine(): Routine {
  return new Date().getHours() < 12 ? "morning" : "night";
}

function getEarnedIds(earnedTaskKeys: readonly string[], prefix: string) {
  const earnedIds: string[] = [];
  for (const key of earnedTaskKeys) {
    if (key.startsWith(prefix)) {
      earnedIds.push(key.slice(prefix.length));
    }
  }
  return earnedIds;
}

function getSyncedTaskTitles(tasks: readonly ExternalTask[]) {
  const titles: string[] = [];
  for (const task of tasks) {
    titles.push(task.title);
  }
  return titles;
}

function getSyncedTaskIds(tasks: readonly ExternalTask[]) {
  const ids: string[] = [];
  for (const task of tasks) {
    ids.push(externalTaskId(task.source, task.externalId));
  }
  return ids;
}

function getSyncedTaskLinks(tasks: readonly ExternalTask[]) {
  const links: (string | null)[] = [];
  for (const task of tasks) {
    links.push(task.emailUrl);
  }
  return links;
}

function getEarnedSyncedTaskIds(tasks: readonly ExternalTask[], earnedTaskKeys: readonly string[]) {
  const earnedIds: string[] = [];
  for (const task of tasks) {
    const earnedKey = `external:${task.source}:${task.externalId}`;
    if (earnedTaskKeys.includes(earnedKey)) {
      earnedIds.push(externalTaskId(task.source, task.externalId));
    }
  }
  return earnedIds;
}

function RoutineTab({
  routine,
  activeRoutine,
  tabId,
  onSelect,
  onKeyDown,
}: {
  routine: Routine;
  activeRoutine: Routine;
  tabId: string;
  onSelect: (routine: Routine) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  function selectRoutine() {
    onSelect(routine);
  }

  const icon: ReactNode = routine === "morning"
    ? <Sun aria-hidden="true" size={15} />
    : <Moon aria-hidden="true" size={15} />;

  return (
    <button className={`btn btn-outline-secondary btn-sm ${activeRoutine === routine ? "active" : ""}`}
      key={routine}
      id={`${tabId}-${routine}`}
      type="button"
      role="tab"
      aria-selected={activeRoutine === routine}
      aria-controls={`${tabId}-panel`}
      tabIndex={activeRoutine === routine ? 0 : -1}
      onClick={selectRoutine}
      onKeyDown={onKeyDown}
    >
      {icon}
      {routine === "morning" ? "Morning" : "Night"}
    </button>
  );
}

export function TaskSection({
  kind,
  selected,
  checked,
  earnedTaskKeys,
  disabled,
  onToggle,
  routines,
  routineGroups,
  weekday = 0,
  tasks = [],
  illustrated = false,
}: TaskSectionProps) {
  const earnedPrefix = `builtin:${selected}:`;
  const [activeRoutine, setActiveRoutine] = useState<Routine>(getInitialRoutine);
  const period = useRef(activeRoutine);
  const tabId = useId();

  useEffect(function syncRoutinePeriod() {
    if (kind !== "routines") return;

    let timer: ReturnType<typeof setTimeout>;
    function updatePeriod() {
      const now = new Date();
      const nextPeriod: Routine = now.getHours() < 12 ? "morning" : "night";
      if (nextPeriod !== period.current) {
        period.current = nextPeriod;
        setActiveRoutine(nextPeriod);
      }
      const nextChange = new Date(now);
      if (nextPeriod === "morning") {
        nextChange.setHours(12, 0, 0, 0);
      } else {
        nextChange.setHours(24, 0, 0, 0);
      }
      clearTimeout(timer);
      timer = setTimeout(updatePeriod, nextChange.getTime() - now.getTime());
    }
    updatePeriod();
    window.addEventListener("focus", updatePeriod);
    return function cleanup() {
      clearTimeout(timer);
      window.removeEventListener("focus", updatePeriod);
    };
  }, [kind]);

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    let next: Routine;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      next = activeRoutine === "morning" ? "night" : "morning";
    } else if (event.key === "Home") {
      next = "morning";
    } else if (event.key === "End") {
      next = "night";
    } else {
      return;
    }
    event.preventDefault();
    setActiveRoutine(next);
    document.getElementById(`${tabId}-${next}`)?.focus();
  }

  if (kind === "daily") {
    const dailyRoutines = routinesFor(routines, "daily", routineWeekday(weekday));
    return (
      <Checklist
        title={routineGroupFor(routineGroups, routineWeekday(weekday))?.title ?? ""}
        label="YOUR DAILY QUESTS"
        icon={<Sparkles aria-hidden="true" size={19} />}
        sectionHref={`/calendar?date=${selected}`}
        items={getRoutineTitles(dailyRoutines)}
        points={getRoutinePoints(dailyRoutines)}
        ids={dailyRoutines.map((routine) => String(routine.id))}
        prefix="daily"
        checked={checked}
        earnedIds={getEarnedIds(earnedTaskKeys, earnedPrefix)}
        disabled={disabled}
        onToggle={onToggle}
        illustration={illustrated ? witchyHappy : undefined}
      />
    );
  }

  if (kind === "synced") {
    return (
      <Checklist
        title="Google & email tasks"
        label="SYNCED TASKS"
        icon={<RefreshCw aria-hidden="true" size={19} />}
        sectionHref={`/calendar?date=${selected}#synced-tasks`}
        items={getSyncedTaskTitles(tasks)}
        ids={getSyncedTaskIds(tasks)}
        prefix="external"
        checked={checked}
        earnedIds={getEarnedSyncedTaskIds(tasks, earnedTaskKeys)}
        taskLinks={getSyncedTaskLinks(tasks)}
        disabled={disabled}
        onToggle={onToggle}
        illustration={illustrated ? witchyHappy : undefined}
      />
    );
  }

  const activeList = routinesFor(routines, activeRoutine, null);
  const routineTabs: ReactNode[] = [];
  const routineNames: Routine[] = ["morning", "night"];
  for (const routine of routineNames) {
    routineTabs.push(
      <RoutineTab
        key={routine}
        routine={routine}
        activeRoutine={activeRoutine}
        tabId={tabId}
        onSelect={setActiveRoutine}
        onKeyDown={handleTabKeyDown}
      />,
    );
  }

  return (
    <div className="routine-tabs">
      <div className="btn-group w-100" role="tablist" aria-label="Routines">
        {routineTabs}
      </div>
      <div role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${activeRoutine}`}>
        <Checklist
          title={activeRoutine === "morning" ? "Morning routine" : "Nightly routine"}
          label={activeRoutine === "morning" ? "RISE & SHINE" : "WIND DOWN"}
          icon={activeRoutine === "morning" ? <Sun aria-hidden="true" size={19} /> : <Moon aria-hidden="true" size={19} />}
          sectionHref={`/calendar?date=${selected}#routines`}
          items={getRoutineTitles(activeList)}
          points={getRoutinePoints(activeList)}
          ids={activeList.map((routine) => String(routine.id))}
          prefix={activeRoutine}
          checked={checked}
          earnedIds={getEarnedIds(earnedTaskKeys, earnedPrefix)}
          disabled={disabled}
          onToggle={onToggle}
        />
      </div>
    </div>
  );
}
