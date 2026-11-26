import { AchievementPreview } from "@/features/planner/components/achievements";
import { CalendarSection } from "@/features/calendar/components/calendar-section";
import { GoogleIntegrationPanel } from "@/features/calendar/components/integration-panel";
import { WeeklyProtocolPanel } from "@/features/calendar/components/weekly-protocol";
import { TaskSection } from "@/features/planner/components/navigation-sections";
import { routineGroupFor, routineWeekday } from "../../shared/planner/routines";
import { dayProgress } from "../../shared/planner/utils";
import { usePlannerContext } from "@/features/planner/hooks/planner-context";
import witchyCalendar from "@/assets/images/witchycalendar.png";

export default function CalendarPage() {
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
    onSelectToday,
  } = usePlannerContext();
  const quest = routineGroupFor(page.routineGroups, routineWeekday(weekday)) ?? { id: 0, weekday: routineWeekday(weekday), title: "", message: "" };
  const { total, completed, percent } = dayProgress(date, checked, page.routines);

  const calendarSummary = (
    <section className="calendar-summary" aria-label="Selected date summary">
      <div className="calendar-summary-copy">
        <p className="text-label accent">YOUR DAILY MISSION // {selected.replaceAll("-", ".")}</p>
        <h2>{date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}</h2>
        <p>{quest.message}</p>
        <div className="calendar-summary-progress">
          <div><span>MISSION PROGRESS</span><strong>{percent}%</strong></div>
          <div className="progress" role="progressbar" aria-label="Selected date task progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className="progress-bar" style={{ width: `${percent}%` }} />
          </div>
          <span>{completed} / {total} BUILT-IN TASKS COMPLETE{page.journalDates.includes(selected) && " · JOURNAL ENTRY"}</span>
        </div>
      </div>
      <div className="calendar-summary-art" aria-hidden="true">
        <img src={witchyCalendar} alt="" />
      </div>
      <AchievementPreview achievements={page.achievements} />
    </section>
  );

  return (
    <div className="calendar-layout row g-3">
      <div className="calendar-tasks col-12 col-md-6">
        {calendarSummary}
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
        <div id="routines">
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
        </div>
        <div id="synced-tasks">
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
      </div>
      <div className="calendar-details col-12 col-md-6">
        <CalendarSection
          date={date}
          selected={selected}
          today={today}
          checks={page.checks}
          journalDates={page.journalDates}
          routines={page.routines}
          googleEnabled
          onSelect={onSelectDate}
          onToday={onSelectToday}
        />
        <WeeklyProtocolPanel selected={selected} weekday={weekday} routineGroups={page.routineGroups} />
        <GoogleIntegrationPanel email={page.email} selected={selected} />
      </div>
    </div>
  );
}
