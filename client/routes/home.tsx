import { useEffect, useState } from "react";
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
import { GoogleIntegrationPanel } from "../components/google/integration-panel";
import { NotesEditor } from "../components/planner/notes-editor";
import { Profile } from "../components/planner/profile";
import { QuestBoard } from "../components/planner/quest-board";
import { LevelHeader } from "../components/planner/level-header";
import {
  DailyProgressPanel,
  ReminderPanel,
} from "../components/planner/dashboard-widgets";
import {
  CalendarSection,
  DailyQuestsSection,
  RoutinesSection,
  SyncedTasksSection,
  WeeklyProtocolSection,
} from "../components/planner/navigation-sections";
import { RewardShop } from "../components/rewards/shop";
import { SignInPanel } from "../components/auth/sign-in-panel";
import { dailyQuests } from "../../shared/planner/definitions";
import type { PlannerActionResult, PlannerPage } from "../../shared/planner/types";
import {
  dateKey,
  dayProgress,
  parseDate,
  weekdayIndex,
} from "../../shared/planner/utils";

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

export default function Home() {
  const page = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const location = useLocation();
  const toggleFetcher = useFetcher<PlannerActionResult>();
  const [today, setToday] = useState(page.authenticated ? page.today : "");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!page.authenticated) return;
    const localToday = dateKey(new Date());
    setToday(localToday);
    if (!new URLSearchParams(window.location.search).has("date")) {
      if (localToday !== page.today) {
        navigate(`${location.pathname}?date=${localToday}${location.hash}`, { replace: true });
      }
    }
  }, [navigate, page, location.pathname, location.hash]);

  useEffect(() => {
    if (location.pathname === "/calendar" && location.hash === "#journal") {
      document.getElementById("journal-entry")?.focus();
    }
  }, [location.pathname, location.hash, page]);

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
  const show = (name: string) => isDashboard || section === name;
  const date = parseDate(selected);
  const weekday = weekdayIndex(date);
  const quest = dailyQuests[weekday];
  const checked = page.checks[selected] ?? [];
  const { total, completed, percent } = dayProgress(date, checked);
  const externalChecked = page.tasks
    .filter((task) => task.completed)
    .map((task) => `${task.source}:${task.externalId}`);
  function toggleTask(taskId: string) {
    if (taskId.startsWith("google:") || taskId.startsWith("gmail:")) {
      const separator = taskId.indexOf(":");
      const source = taskId.slice(0, separator);
      const externalId = taskId.slice(separator + 1);
      toggleFetcher.submit(
        {
          intent: "toggle_external",
          source,
          externalId,
          date: selected,
          completed: String(!externalChecked.includes(taskId)),
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
        completed: String(!checked.includes(taskId)),
      },
      { method: "post" },
    );
  }

  function selectDate(next: string) {
    navigate(`${location.pathname}?date=${next}`);
  }

  function addJournal() {
    if (section === "calendar") {
      document.getElementById("journal-entry")?.focus();
    } else {
      navigate(`/calendar?date=${selected}#journal`);
    }
  }

  return (
    <div className={`app-shell authenticated-shell ${menuOpen ? "menu-expanded" : ""}`}>
      <PlannerNavigation
        selected={selected}
        section={section}
        expanded={menuOpen}
        setExpanded={setMenuOpen}
      />
      <header className="topbar">
        <div className="topbar-left">
          <span className="topbar-caption">YOUR LIFE, YOUR QUEST.</span>
        </div>
        <div className="topbar-right">
          <span className="wallet-balance" aria-label={`${page.balance} points`}>
            <Sparkles aria-hidden="true" size={13} /> {page.balance} PTS
          </span>
          <span className="top-date">
            {date
              .toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
              .toUpperCase()}
          </span>
          <form method="post" action="/auth/logout">
            <button className="logout-button" type="submit">
              SIGN OUT
            </button>
          </form>
        </div>
      </header>

      <main className={`dashboard ${isDashboard ? "" : "section-page"}`}>
        {!isDashboard && section !== "profile" && (
          <div className="page-heading">
            <p className="eyebrow accent">YOUR PERSONAL COMMAND CENTER</p>
            <h1>{navigationSections.find(([path]) => path === section)?.[1] ?? "Page not found"}</h1>
          </div>
        )}
        {isDashboard && <>
        <div className="intro">
          <div>
            <p className="eyebrow accent">
              YOUR PERSONAL COMMAND CENTER <span>// 001</span>
            </p>
            <h1>
              YOUR LIFE, <em>YOUR QUEST.</em>
            </h1>
            <p className="intro-copy">
              A little progress is still progress. Let's make today count.
            </p>
          </div>
          <div className="intro-tag">
            <Sparkles aria-hidden="true" size={14} /> BE AGGRESSIVELY KIND{" "}
            <small>TO YOURSELF, ALWAYS.</small>
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

        {isDashboard && <LevelHeader totalXp={page.totalXp} unlocked={page.achievements.filter((item) => item.unlockedAt).length} />}
        {section === "profile" && <Profile checks={page.checks} today={today || page.today} balance={page.balance} totalXp={page.totalXp} achievements={page.achievements} />}
        {section === "quest-board" && <QuestBoard quests={page.quests} selected={selected} />}
        <div className="dashboard-grid">
          <aside className="left-column">
            {show("calendar") && (
              <CalendarSection
                date={date}
                selected={selected}
                today={today || page.today}
                checks={page.checks}
                journalDates={page.journalDates}
                showJournal={section === "calendar"}
                journal={page.journal}
                onSelect={selectDate}
                onToday={() => selectDate(today || page.today)}
                onAddJournal={addJournal}
              />
            )}
            {show("weekly") && (
              <WeeklyProtocolSection selected={selected} weekday={weekday} />
            )}
            {show("reminder") && (
            <ReminderPanel selected={selected} />
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
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <Sparkles className="hero-star" aria-hidden="true" />
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
            {show("notes") && (
            <NotesEditor selected={selected} note={page.note} />
            )}
            {show("quests") && (
            <DailyQuestsSection
              selected={selected}
              weekday={weekday}
              checked={checked}
              earnedTaskKeys={page.earnedTaskKeys}
              disabled={toggleFetcher.state !== "idle"}
              onToggle={toggleTask}
            />
            )}
            {show("routines") && (
            <RoutinesSection
              selected={selected}
              checked={checked}
              earnedTaskKeys={page.earnedTaskKeys}
              disabled={toggleFetcher.state !== "idle"}
              onToggle={toggleTask}
            />
            )}
            {show("synced-tasks") && (
            <SyncedTasksSection
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
            {show("progress") && (
            <DailyProgressPanel
              selected={selected}
              completed={completed}
              total={total}
              percent={percent}
              points={page.todayPoints}
            />
            )}
            {show("rewards") && (
            <RewardShop balance={page.balance} selected={selected} redemptions={page.redemptions} />
            )}
            {show("google") && (
            <GoogleIntegrationPanel email={page.email} selected={selected} />
            )}
          </aside>
        </div>
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
