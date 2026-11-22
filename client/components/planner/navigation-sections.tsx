import { Moon, RefreshCw, Sparkles, Sun } from "lucide-react";
import type { ExternalTask } from "../../../shared/planner/types";
import { dailyQuests, morningRoutine, nightRoutine } from "../../../shared/planner/definitions";
import { Checklist } from "./checklist";
import { JournalEditor } from "./journal-editor";
import { MissionCalendar } from "./mission-calendar";
import { WeeklyProtocolPanel } from "./dashboard-widgets";

type CalendarSectionProps = {
  date: Date;
  selected: string;
  today: string;
  checks: Record<string, string[]>;
  journalDates: string[];
  showJournal: boolean;
  journal: string;
  onSelect: (date: string) => void;
  onToday: () => void;
  onAddJournal: () => void;
};

export function CalendarSection({
  date,
  selected,
  today,
  checks,
  journalDates,
  showJournal,
  journal,
  onSelect,
  onToday,
  onAddJournal,
}: CalendarSectionProps) {
  return (
    <>
      <MissionCalendar
        date={date}
        selected={selected}
        today={today}
        checks={checks}
        journalDates={journalDates}
        onSelect={onSelect}
        onToday={onToday}
        onAddJournal={onAddJournal}
      />
      {showJournal && (
        <JournalEditor key={selected} selected={selected} journal={journal} />
      )}
    </>
  );
}

type ChecklistSectionProps = {
  selected: string;
  checked: string[];
  earnedTaskKeys: string[];
  disabled: boolean;
  onToggle: (id: string) => void;
};

type DailyQuestsSectionProps = ChecklistSectionProps & {
  weekday: number;
};

export function DailyQuestsSection({
  selected,
  weekday,
  checked,
  earnedTaskKeys,
  disabled,
  onToggle,
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

  return (
    <div className="routine-grid">
      <Checklist
        title="Morning routine"
        eyebrow="RISE & SHINE"
        icon={<Sun aria-hidden="true" size={19} />}
        sectionHref={`/routines?date=${selected}`}
        items={morningRoutine}
        prefix="morning"
        checked={checked}
        earnedIds={earnedTaskKeys
          .filter((key) => key.startsWith(`${earnedPrefix}morning-`))
          .map((key) => key.slice(earnedPrefix.length))}
        disabled={disabled}
        onToggle={onToggle}
      />
      <Checklist
        title="Nightly routine"
        eyebrow="WIND DOWN"
        icon={<Moon aria-hidden="true" size={19} />}
        sectionHref={`/routines?date=${selected}`}
        items={nightRoutine}
        prefix="night"
        checked={checked}
        earnedIds={earnedTaskKeys
          .filter((key) => key.startsWith(`${earnedPrefix}night-`))
          .map((key) => key.slice(earnedPrefix.length))}
        disabled={disabled}
        onToggle={onToggle}
      />
    </div>
  );
}

type SyncedTasksSectionProps = ChecklistSectionProps & {
  tasks: readonly ExternalTask[];
};

export function SyncedTasksSection({
  selected,
  tasks,
  checked,
  earnedTaskKeys,
  disabled,
  onToggle,
}: SyncedTasksSectionProps) {
  return (
    <Checklist
      title="Google & email tasks"
      eyebrow="SYNCED TASKS"
      icon={<RefreshCw aria-hidden="true" size={19} />}
      sectionHref={`/synced-tasks?date=${selected}`}
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

type WeeklyProtocolSectionProps = {
  selected: string;
  weekday: number;
};

export function WeeklyProtocolSection({
  selected,
  weekday,
}: WeeklyProtocolSectionProps) {
  return (
    <>
      <WeeklyProtocolPanel selected={selected} weekday={weekday} />
      <div className="side-quote">
        <Sparkles aria-hidden="true" size={14} /> PROGRESS, NOT
        PERFECTION.
        <br />
        <small>YOU ARE ALREADY DOING ENOUGH.</small>
      </div>
    </>
  );
}
