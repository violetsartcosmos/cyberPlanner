import { Sparkles } from "lucide-react";
import { CalendarSection } from "@/features/calendar/components/calendar-section";
import { NotesEditor } from "@/features/planner/components/notes-editor";
import { LevelHeader } from "@/features/planner/components/level-header";
import { TaskSection } from "@/features/planner/components/navigation-sections";
import { dailyQuests } from "../../shared/planner/definitions";
import { dayProgress } from "../../shared/planner/utils";
import { usePlannerContext } from "@/features/planner/hooks/planner-context";
import witchyBroom from "@/assets/images/witchybroom.png";

export default function DashboardPage() {
  const {
    page,
    selected,
    today,
    date,
    weekday,
    checked,
    externalChecked,
    tasksDisabled,
    onToggleTask,
    onSelectDate,
  } = usePlannerContext();
  const quest = dailyQuests[weekday];
  const { total, completed } = dayProgress(date, checked);
  let unlocked = 0;
  for (const achievement of page.achievements) {
    if (achievement.unlockedAt) unlocked += 1;
  }
  const dateSummary = (
    <section className="panel date-summary" aria-label="Selected date summary">
      <p className="eyebrow">DATE SUMMARY</p>
      <h2>{date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })}</h2>
      <p>
        {completed} / {total} TASKS COMPLETE
        {page.journalDates.includes(selected) && " · JOURNAL ENTRY"}
      </p>
    </section>
  );

  return (
    <>
      <LevelHeader totalXp={page.totalXp} unlocked={unlocked} />
      <div className="dashboard-grid">
        <aside className="left-column">
          <CalendarSection
            date={date}
            selected={selected}
            today={today}
            checks={page.checks}
            journalDates={page.journalDates}
            showJournal={false}
            journal={page.journal}
            googleEnabled={false}
            onSelect={onSelectDate}
            onToday={() => onSelectDate(today)}
          />
          {dateSummary}
          <TaskSection
            kind="daily"
            selected={selected}
            weekday={weekday}
            checked={checked}
            earnedTaskKeys={page.earnedTaskKeys}
            disabled={tasksDisabled}
            onToggle={onToggleTask}
          />
        </aside>

        <div className="main-column">
          <section className="hero-panel">
            <div className="hero-copy">
              <p className="eyebrow">
                DAY'S MISSION <span>// {selected.replaceAll("-", ".")}</span>
              </p>
              <h2>
                {date.toLocaleDateString("en-US", { weekday: "long" })}
                <br />
                <em>{quest.title}.</em>
              </h2>
              <p>{quest.message}</p>
              <div className="hero-badge">
                <Sparkles aria-hidden="true" size={12} /> DAILY QUEST ACTIVE
              </div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <img className="hero-broom" src={witchyBroom} alt="" />
              <span className="hero-art-label">
                LIFE IS THE
                <br />
                MAIN QUEST
              </span>
              <span className="hero-art-index">
                <Sparkles aria-hidden="true" size={11} /> 001 / 007
              </span>
            </div>
          </section>
          <NotesEditor selected={selected} note={page.note} onSelect={onSelectDate} />
          <TaskSection
            kind="synced"
            selected={selected}
            tasks={page.tasks}
            checked={externalChecked}
            earnedTaskKeys={page.earnedTaskKeys}
            disabled={tasksDisabled}
            onToggle={onToggleTask}
          />
        </div>

        <aside className="right-column">
          <TaskSection
            kind="routines"
            selected={selected}
            checked={checked}
            earnedTaskKeys={page.earnedTaskKeys}
            disabled={tasksDisabled}
            onToggle={onToggleTask}
          />
        </aside>
      </div>
    </>
  );
}
