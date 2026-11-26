import { Sparkles } from "lucide-react";
import { CalendarSection } from "@/features/calendar/components/calendar-section";
import { LevelHeader } from "@/features/planner/components/level-header";
import { TaskSection } from "@/features/planner/components/navigation-sections";
import { routineGroupFor, routineWeekday } from "../../shared/planner/routines";
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
  const quest = routineGroupFor(page.routineGroups, routineWeekday(weekday)) ?? { id: 0, weekday: routineWeekday(weekday), title: "", message: "" };
  const { total, completed } = dayProgress(date, checked, page.routines);
  let earned = 0;
  for (const achievement of page.achievements) {
    if (achievement.earnedAt) earned += 1;
  }
  const dateSummary = (
    <section className="card p-3 date-summary" aria-label="Selected date summary">
      <p className="text-label">DATE SUMMARY</p>
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
      <LevelHeader totalXp={page.totalXp} earned={earned} />
      <div className="row g-3 align-items-start">
        <aside className="col-12 col-lg-4 col-xl-3 d-grid gap-3">
          <CalendarSection
            date={date}
            selected={selected}
            today={today}
            checks={page.checks}
            journalDates={page.journalDates}
            routines={page.routines}
            googleEnabled={false}
            onSelect={onSelectDate}
            onToday={() => onSelectDate(today)}
          />
          {dateSummary}
          <TaskSection
            kind="daily"
            selected={selected}
            routines={page.routines}
            routineGroups={page.routineGroups}
            weekday={weekday}
            checked={checked}
            earnedTaskKeys={page.earnedTaskKeys}
            disabled={tasksDisabled}
            onToggle={onToggleTask}
          />
        </aside>

        <div className="col-12 col-lg-8 col-xl-6 d-grid gap-3">
          <section className="hero-panel">
            <div className="hero-copy">
              <p className="text-label">
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
          <TaskSection
            kind="synced"
            selected={selected}
            routines={page.routines}
            routineGroups={page.routineGroups}
            tasks={page.tasks}
            checked={externalChecked}
            earnedTaskKeys={page.earnedTaskKeys}
            disabled={tasksDisabled}
            onToggle={onToggleTask}
          />
        </div>

        <aside className="col-12 col-xl-3 d-grid gap-3">
          <TaskSection
            kind="routines"
            selected={selected}
            routines={page.routines}
            routineGroups={page.routineGroups}
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
