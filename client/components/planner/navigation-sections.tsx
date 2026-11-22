import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Moon, RefreshCw, Sparkles, Sun } from "lucide-react";
import type { ExternalTask } from "../../../shared/planner/types";
import { dailyQuests, morningRoutine, nightRoutine } from "../../../shared/planner/definitions";
import { Checklist } from "./checklist";

type ChecklistSectionProps = {
  selected: string;
  checked: string[];
  earnedTaskKeys: string[];
  disabled: boolean;
  onToggle: (id: string) => void;
};

type DailyQuestsSectionProps = ChecklistSectionProps & {
  weekday: number;
  illustrated?: boolean;
};

export function DailyQuestsSection({
  selected,
  weekday,
  checked,
  earnedTaskKeys,
  disabled,
  onToggle,
  illustrated = false,
}: DailyQuestsSectionProps) {
  const earnedPrefix = `builtin:${selected}:`;

  return (
    <Checklist
      title={dailyQuests[weekday].title}
      eyebrow="YOUR DAILY QUESTS"
      icon={<Sparkles aria-hidden="true" size={19} />}
      sectionHref={`/quests?date=${selected}`}
      items={dailyQuests[weekday].tasks}
      prefix="daily"
      checked={checked}
      earnedIds={earnedTaskKeys
        .filter((key) => key.startsWith(earnedPrefix))
        .map((key) => key.slice(earnedPrefix.length))}
      disabled={disabled}
      onToggle={onToggle}
      illustration={illustrated ? "/witchyhappy.png" : undefined}
    />
  );
}

export function RoutinesSection({
  selected,
  checked,
  earnedTaskKeys,
  disabled,
  onToggle,
}: ChecklistSectionProps) {
  const earnedPrefix = `builtin:${selected}:`;
  const [activeRoutine, setActiveRoutine] = useState<"morning" | "night">(
    () => new Date().getHours() < 12 ? "morning" : "night",
  );
  const period = useRef(activeRoutine);
  const tabId = useId();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function updatePeriod() {
      const now = new Date();
      const nextPeriod = now.getHours() < 12 ? "morning" : "night";
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
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", updatePeriod);
    };
  }, []);

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    let next: "morning" | "night";
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

  return (
    <div className="routine-tabs">
      <div className="routine-tab-list" role="tablist" aria-label="Routines">
        {(["morning", "night"] as const).map((routine) => (
          <button
            key={routine}
            id={`${tabId}-${routine}`}
            type="button"
            role="tab"
            aria-selected={activeRoutine === routine}
            aria-controls={`${tabId}-panel`}
            tabIndex={activeRoutine === routine ? 0 : -1}
            onClick={() => setActiveRoutine(routine)}
            onKeyDown={handleTabKeyDown}
          >
            {routine === "morning" ? <Sun aria-hidden="true" size={15} /> : <Moon aria-hidden="true" size={15} />}
            {routine === "morning" ? "Morning" : "Night"}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${activeRoutine}`}>
        <Checklist
          title={activeRoutine === "morning" ? "Morning routine" : "Nightly routine"}
          eyebrow={activeRoutine === "morning" ? "RISE & SHINE" : "WIND DOWN"}
          icon={activeRoutine === "morning" ? <Sun aria-hidden="true" size={19} /> : <Moon aria-hidden="true" size={19} />}
          sectionHref={`/quests?date=${selected}#routines`}
          items={activeRoutine === "morning" ? morningRoutine : nightRoutine}
          prefix={activeRoutine}
          checked={checked}
          earnedIds={earnedTaskKeys
            .filter((key) => key.startsWith(`${earnedPrefix}${activeRoutine}-`))
            .map((key) => key.slice(earnedPrefix.length))}
          disabled={disabled}
          onToggle={onToggle}
        />
      </div>
    </div>
  );
}

type SyncedTasksSectionProps = ChecklistSectionProps & {
  tasks: readonly ExternalTask[];
  illustrated?: boolean;
};

export function SyncedTasksSection({
  selected,
  tasks,
  checked,
  earnedTaskKeys,
  disabled,
  onToggle,
  illustrated = false,
}: SyncedTasksSectionProps) {
  return (
    <Checklist
      title="Google & email tasks"
      eyebrow="SYNCED TASKS"
      icon={<RefreshCw aria-hidden="true" size={19} />}
      sectionHref={`/quests?date=${selected}#synced-tasks`}
      items={tasks.map((task) => task.title)}
      ids={tasks.map((task) => `${task.source}:${task.externalId}`)}
      prefix="external"
      checked={checked}
      earnedIds={tasks
        .filter((task) =>
          earnedTaskKeys.includes(
            `external:${task.source}:${task.externalId}`,
          ),
        )
        .map((task) => `${task.source}:${task.externalId}`)}
      taskLinks={tasks.map((task) => task.emailUrl)}
      disabled={disabled}
      onToggle={onToggle}
    />
  );
}
