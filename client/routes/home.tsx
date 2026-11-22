import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigate,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import {
  navigationSections,
  PlannerNavigation,
} from "../components/layout/planner-navigation";
import { CalendarSection } from "../components/calendar/calendar-section";
import { GoogleIntegrationPanel } from "../components/calendar/integration-panel";
import { WeeklyProtocolPanel } from "../components/calendar/weekly-protocol";
import { NotesEditor } from "../components/planner/notes-editor";
import { Profile } from "../components/planner/profile";
import { QuestBoard } from "../components/planner/quest-board";
import { LevelHeader } from "../components/planner/level-header";
import {
  DailyAffirmation,
} from "../components/planner/dashboard-widgets";
import {
  TaskSection,
} from "../components/planner/navigation-sections";
import { RewardShop } from "../components/shop/shop";
import { SignInPanel } from "../components/auth/sign-in-panel";
import { dailyQuests } from "../../shared/planner/definitions";
import type { ExternalTask, PlannerActionResult, PlannerPage } from "../../shared/planner/types";
import type { Achievement } from "../../shared/planner/gamification";
import {
  dateKey,
  dayProgress,
  externalTaskId,
  isExternalTaskId,
  parseDate,
  weekdayIndex,
} from "../../shared/planner/utils";

function incrementCelebration(previous: number) {
  return previous + 1;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const response = await fetch(`/api/planner${url.search}`, { signal: request.signal });
  if (!response.ok) throw new Error(`Could not load the planner (${response.status}).`);
  const page = await response.json() as PlannerPage;
  if (page.authenticated && (
    typeof page.journal !== "string" || !Array.isArray(page.journalDates) ||
    !Array.isArray(page.achievements) || !Array.isArray(page.quests) ||
    !Array.isArray(page.newlyUnlocked) || typeof page.totalXp !== "number"
  )) {
    throw new Error("The planner server is out of date. Apply database migrations and restart the server.");
  }
  return page;
}

export async function action({ request }: ActionFunctionArgs) {
  const response = await fetch("/api/planner", {
    method: "POST",
    body: await request.formData(),
    signal: request.signal,
  });
  if (!response.ok) throw new Error(`Could not submit the planner action (${response.status}).`);
  return response.json() as Promise<PlannerActionResult>;
}

function getCompletedExternalTaskIds(tasks: readonly ExternalTask[]) {
  const ids: string[] = [];
  for (const task of tasks) {
    if (task.completed) {
      ids.push(externalTaskId(task.source, task.externalId));
    }
  }
  return ids;
}

function getUnlockedAchievementCount(achievements: readonly Achievement[]) {
  let count = 0;
  for (const achievement of achievements) {
    if (achievement.unlockedAt) count += 1;
  }
  return count;
}

function getNavigationLabel(section: string) {
  for (const [path, label] of navigationSections) {
    if (path === section) return label;
  }
  return "Page not found";
}

export default function Home() {
  const page = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const location = useLocation();
  const toggleFetcher = useFetcher<PlannerActionResult>();
  const [today, setToday] = useState(page.authenticated ? page.today : "");
  const [menuOpen, setMenuOpen] = useState(false);
  const [celebration, setCelebration] = useState(0);
  const pendingCelebration = useRef(false);
  const toggleInFlight = useRef(false);

  useEffect(function syncToggleFetcher() {
    if (toggleFetcher.state !== "idle") {
      toggleInFlight.current = true;
    } else if (toggleInFlight.current) {
      toggleInFlight.current = false;
      if (pendingCelebration.current && toggleFetcher.data?.ok && location.pathname === "/") {
        setCelebration(incrementCelebration);
      }
      pendingCelebration.current = false;
    }
  }, [toggleFetcher.state, toggleFetcher.data, location.pathname]);

  useEffect(function clearCelebrationTimer() {
    if (!celebration) return;
    function clearCelebration() {
      setCelebration(0);
    }
    const timer = setTimeout(clearCelebration, 1800);
    function cleanupCelebrationTimer() {
      clearTimeout(timer);
    }
    return cleanupCelebrationTimer;
  }, [celebration]);

  useEffect(function syncTodayWithServer() {
    if (!page.authenticated) return;
    const serverToday = page.today;
    let timer: ReturnType<typeof setTimeout>;
    function updateToday() {
      const now = new Date();
      const localToday = dateKey(now);
      setToday(localToday);
      if (!new URLSearchParams(window.location.search).has("date")) {
        if (localToday !== serverToday) {
          navigate(`${location.pathname}?date=${localToday}${location.hash}`, { replace: true });
        }
      }
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      clearTimeout(timer);
      timer = setTimeout(updateToday, midnight.getTime() - now.getTime());
    }
    updateToday();
    window.addEventListener("focus", updateToday);
    function cleanupTodaySync() {
      clearTimeout(timer);
      window.removeEventListener("focus", updateToday);
    }
    return cleanupTodaySync;
  }, [navigate, page, location.pathname, location.hash]);

  if (!page.authenticated) {
    return (
      <SignInPanel
        missingConfiguration={page.missingConfiguration}
        authError={page.authError}
      />
    );
  }

  const selected = page.selected;
  const section = location.pathname.slice(1);
  const isDashboard = !section;
  const isCalendar = section === "calendar" || section === "quests";

  function showSection(name: string) {
    return isDashboard || section === name;
  }

  function selectToday() {
    selectDate(today);
  }

  const date = parseDate(selected);
  const weekday = weekdayIndex(date);
  const quest = dailyQuests[weekday];
  const checked = page.checks[selected] ?? [];
  const { total, completed, percent } = dayProgress(date, checked);
  const externalChecked = getCompletedExternalTaskIds(page.tasks);
  function toggleTask(taskId: string) {
    const completed = isExternalTaskId(taskId)
      ? !externalChecked.includes(taskId)
      : !checked.includes(taskId);
    pendingCelebration.current = isDashboard && completed;
    if (isExternalTaskId(taskId)) {
      const separator = taskId.indexOf(":");
      const source = taskId.slice(0, separator);
      const externalId = taskId.slice(separator + 1);
      toggleFetcher.submit(
        {
          intent: "toggle_external",
          source,
          externalId,
          date: selected,
          completed: String(completed),
        },
        { method: "post" },
      );
      return;
    }
    toggleFetcher.submit(
      {
        intent: "toggle_builtin",
        taskId,
        date: selected,
        completed: String(completed),
      },
      { method: "post" },
    );
  }

  function selectDate(next: string) {
    const hash = isCalendar && location.hash === "#journal" ? "#journal" : "";
    navigate(`${location.pathname}?date=${next}${hash}`);
  }

  return (
    <div className={`app-shell authenticated-shell ${menuOpen ? "menu-expanded" : ""}`}>
      {isDashboard && celebration > 0 && (
        <div className="task-celebration" key={celebration} aria-hidden="true">
          <img src="/witchyaction.png" alt="" />
        </div>
      )}
      <PlannerNavigation
        selected={selected}
        section={section}
        expanded={menuOpen}
        setExpanded={setMenuOpen}
      />
      <main className={`dashboard ${isDashboard ? "" : "section-page"}`}>
        <header className={`dashboard-header ${isDashboard ? "dashboard-header-home" : ""}`}>
          {!isDashboard && section !== "profile" && (
            <div className="page-heading">
              <p className="eyebrow accent">CYBER PLANNER</p>
              <h1>{getNavigationLabel(isCalendar ? "calendar" : section)}</h1>
            </div>
          )}
          {isDashboard && <>
            <div className="intro">
              <div>
                <p className="eyebrow accent">
                  CYBER PLANNER <span>// 001</span>
                </p>
                <h1>
                  YOUR LIFE, <em>YOUR QUEST.</em>
                </h1>
                <p className="intro-copy">
                  A little progress is still progress. Let's make today count.
                </p>
              </div>
            </div>
            <section className="mobile-welcome">
              <div>
                <p className="eyebrow">YOUR LIFE, YOUR QUEST</p>
                <h1>
                  {selected === today
                    ? "Today"
                    : date.toLocaleDateString("en-US", { weekday: "long" })}
                </h1>
                <p>{quest.message}</p>
              </div>
              <div className="mobile-momentum">
                <strong>{percent}%</strong>
                <span>COMPLETE</span>
              </div>
              <div className="mobile-summary">
                <span>
                  <b>{completed}</b> / {total} tasks complete
                </span>
                <span>
                  <Sparkles aria-hidden="true" size={12} /> {page.todayPoints} PTS
                  EARNED
                </span>
              </div>
            </section>
          </>}
          <div className="header-utilities">
            <div className="hero-actions">
              <span className="hero-date">
                {date
                  .toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                  .toUpperCase()}
              </span>
            </div>
            {isDashboard && <DailyAffirmation today={today || page.today} />}
          </div>
        </header>
        {toggleFetcher.data?.error && (
          <div className="storage-error" role="alert">
            {toggleFetcher.data.error}
          </div>
        )}
        {toggleFetcher.data?.unlockedAchievements && toggleFetcher.data.unlockedAchievements.length > 0 && (
          <div className="achievement-notice" role="status">
            Achievement unlocked: {toggleFetcher.data.unlockedAchievements.join(", ")}!
          </div>
        )}
        {page.newlyUnlocked.length > 0 && (
          <div className="achievement-notice" role="status">
            Achievement unlocked: {page.newlyUnlocked.join(", ")}!
          </div>
        )}

        {isDashboard && <LevelHeader totalXp={page.totalXp} unlocked={getUnlockedAchievementCount(page.achievements)} />}
        {section === "profile" && <Profile checks={page.checks} today={today || page.today} balance={page.balance} totalXp={page.totalXp} achievements={page.achievements} />}
        {section === "quest-board" && <QuestBoard quests={page.quests} selected={selected} />}
        {isCalendar && (
          <div className="calendar-layout">
            <div className="calendar-tasks">
              <TaskSection
                kind="daily"
                selected={selected}
                weekday={weekday}
                checked={checked}
                earnedTaskKeys={page.earnedTaskKeys}
                disabled={toggleFetcher.state !== "idle"}
                onToggle={toggleTask}
              />
              <div id="routines">
                <TaskSection
                  kind="routines"
                  selected={selected}
                  checked={checked}
                  earnedTaskKeys={page.earnedTaskKeys}
                  disabled={toggleFetcher.state !== "idle"}
                  onToggle={toggleTask}
                />
              </div>
              <div id="synced-tasks">
                <TaskSection
                  kind="synced"
                  selected={selected}
                  tasks={page.tasks}
                  checked={externalChecked}
                  earnedTaskKeys={page.earnedTaskKeys}
                  disabled={toggleFetcher.state !== "idle"}
                  onToggle={toggleTask}
                />
              </div>
            </div>
            <div className="calendar-details">
              <CalendarSection
                date={date}
                selected={selected}
                today={today || page.today}
                checks={page.checks}
                journalDates={page.journalDates}
                showJournal={location.hash === "#journal"}
                journal={page.journal}
                googleEnabled
                onSelect={selectDate}
                onToday={selectToday}
              />
              <WeeklyProtocolPanel selected={selected} weekday={weekday} />
              <GoogleIntegrationPanel email={page.email} selected={selected} />
            </div>
          </div>
        )}
        {!isCalendar && (
        <div className="dashboard-grid">
          <aside className="left-column">
            {isDashboard && (
              <CalendarSection
                date={date}
                selected={selected}
                today={today || page.today}
                checks={page.checks}
                journalDates={page.journalDates}
                showJournal={false}
                journal={page.journal}
                googleEnabled={false}
                onSelect={selectDate}
                onToday={selectToday}
              />
            )}
            {isDashboard && (
            <TaskSection
              kind="daily"
              selected={selected}
              weekday={weekday}
              checked={checked}
              earnedTaskKeys={page.earnedTaskKeys}
              disabled={toggleFetcher.state !== "idle"}
              onToggle={toggleTask}
            />
            )}
          </aside>

          <div className="main-column">
            {isDashboard && (
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
                <img className="hero-broom" src="/witchybroom.png" alt="" />
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
            )}
            {showSection("notes") && (
            <NotesEditor selected={selected} note={page.note} />
            )}
            {isDashboard && (
            <TaskSection
              kind="synced"
              selected={selected}
              tasks={page.tasks}
              checked={externalChecked}
              earnedTaskKeys={page.earnedTaskKeys}
              disabled={toggleFetcher.state !== "idle"}
              onToggle={toggleTask}
            />
            )}
          </div>

          <aside className="right-column">
            {isDashboard && (
            <TaskSection
              kind="routines"
              selected={selected}
              checked={checked}
              earnedTaskKeys={page.earnedTaskKeys}
              disabled={toggleFetcher.state !== "idle"}
              onToggle={toggleTask}
            />
            )}
            {section === "rewards" && (
            <RewardShop balance={page.balance} selected={selected} redemptions={page.redemptions} />
            )}
          </aside>
        </div>
        )}
        <footer>
          <span>
            CYBERPLANNER <Sparkles aria-hidden="true" size={11} /> YOUR LIFE,
            YOUR QUEST.
          </span>
          <span>BUILT FOR THE BEAUTIFULLY HUMAN EXPERIENCE</span>
        </footer>
      </main>
    </div>
  );
}
