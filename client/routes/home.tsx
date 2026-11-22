import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  Heart,
  Menu,
  Moon,
  RefreshCw,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import {
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigate,
  Link,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { Checklist } from "../components/planner/checklist";
import { GoogleIntegrationPanel } from "../components/google/integration-panel";
import { MissionCalendar } from "../components/planner/mission-calendar";
import { JournalEditor } from "../components/planner/journal-editor";
import { NotesEditor } from "../components/planner/notes-editor";
import { Profile } from "../components/planner/profile";
import { QuestBoard } from "../components/planner/quest-board";
import { LevelHeader } from "../components/planner/level-header";
import { RewardShop } from "../components/rewards/shop";
import { SignInPanel } from "../components/auth/sign-in-panel";
import { dailyQuests, morningRoutine, nightRoutine } from "../../shared/planner/definitions";
import type { PlannerActionResult, PlannerPage } from "../../shared/planner/types";
import {
  dateKey,
  dayProgress,
  parseDate,
  weekdayIndex,
  weekdays,
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
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

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
  const externalIds = page.tasks.map(
    (task) => `${task.source}:${task.externalId}`,
  );
  const externalChecked = page.tasks
    .filter((task) => task.completed)
    .map((task) => `${task.source}:${task.externalId}`);
  const externalEarned = page.tasks
    .filter((task) =>
      page.earnedTaskKeys.includes(
        `external:${task.source}:${task.externalId}`,
      ),
    )
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

  const sections = [
    ["", "Dashboard"], ["calendar", "Calendar"], ["weekly", "Weekly protocol"],
    ["reminder", "Reminder"], ["quests", "Daily quests"], ["routines", "Routines"],
    ["synced-tasks", "Synced tasks"], ["progress", "Progress"], ["rewards", "Rewards"],
    ["google", "Google sync"], ["notes", "Notes"], ["profile", "Profile"],
    ["quest-board", "Quest board"],
  ] as const;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="CyberPlanner home">
          <span className="brand-mark">
            <Sparkles aria-hidden="true" size={28} />
          </span>
          <span>
            CYBER<span>PLANNER</span>
            <small>LIFE MANAGEMENT SYSTEM</small>
          </span>
        </a>
        <div className="topbar-right">
          <div className="menu-container" ref={menuRef}>
            <button
              ref={menuButtonRef}
              className="menu-button"
              type="button"
              aria-expanded={menuOpen}
              aria-controls="planner-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X aria-hidden="true" size={17} /> : <Menu aria-hidden="true" size={17} />}
              MENU
            </button>
            {menuOpen && <nav id="planner-navigation" className="section-navigation" aria-label="Planner sections">
              {sections.map(([path, label]) => (
                <Link
                  key={path}
                  to={`${path ? `/${path}` : "/"}?date=${selected}`}
                  aria-current={section === path ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  {label}
                </Link>
              ))}
            </nav>}
          </div>
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
            <h1>{sections.find(([path]) => path === section)?.[1] ?? "Page not found"}</h1>
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
            {show("calendar") && <>
            <MissionCalendar
              date={date}
              selected={selected}
              today={today || page.today}
              checks={page.checks}
              journalDates={page.journalDates}
              onSelect={selectDate}
              onToday={() => selectDate(today || page.today)}
              onAddJournal={addJournal}
            />
            {section === "calendar" && <JournalEditor key={selected} selected={selected} journal={page.journal} />}
            </>}
            {show("weekly") && <>
            <section className="panel week-panel">
              <Link className="section-label section-link" to={`/weekly?date=${selected}`}>
                <span>02 / WEEKLY PROTOCOL</span>
                <Sparkles aria-hidden="true" size={12} />
              </Link>
              <h2>Every day has a mission.</h2>
              <p>Small steps, one day at a time.</p>
              <div className="week-list">
                {dailyQuests.map((day, index) => (
                  <div
                    key={day.title}
                    className={index === weekday ? "active-weekday" : ""}
                  >
                    <span>{weekdays[index].toUpperCase()}</span>
                    <strong>{day.title}</strong>
                    <b>
                      {index === weekday ? (
                        <ChevronRight aria-hidden="true" size={12} />
                      ) : null}
                    </b>
                  </div>
                ))}
              </div>
            </section>
            </>}
            {show("reminder") && (
            <section className="panel motivation-panel">
              <Link className="section-label section-link" to={`/reminder?date=${selected}`}>
                <span>03 / A LITTLE REMINDER</span>
                <Sparkles aria-hidden="true" size={12} />
              </Link>
              <Heart
                className="motivation-heart"
                aria-hidden="true"
                fill="currentColor"
                size={40}
              />
              <h2>
                You're doing
                <br />
                <em>amazing.</em>
              </h2>
              <p>
                Showing up for yourself is the real win. Keep going, one quest
                at a time.
              </p>
              <div className="motivation-bottom">
                SELF-KINDNESS IS A SUPERPOWER
                <ArrowUpRight aria-hidden="true" size={12} />
              </div>
            </section>
            )}
            {show("weekly") && (
            <div className="side-quote">
              <Sparkles aria-hidden="true" size={14} /> PROGRESS, NOT
              PERFECTION.
              <br />
              <small>YOU ARE ALREADY DOING ENOUGH.</small>
            </div>
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
            <Checklist
              title={quest.title}
              eyebrow="YOUR DAILY QUESTS"
              icon={<Sparkles aria-hidden="true" size={19} />}
              sectionHref={`/quests?date=${selected}`}
              items={quest.tasks}
              prefix="daily"
              checked={checked}
              earnedIds={page.earnedTaskKeys
                .filter((key) => key.startsWith(`builtin:${selected}:`))
                .map((key) => key.slice(`builtin:${selected}:`.length))}
              disabled={toggleFetcher.state !== "idle"}
              onToggle={toggleTask}
            />
            )}
            {show("routines") && (
            <div className="routine-grid">
              <Checklist
                title="Morning routine"
                eyebrow="RISE & SHINE"
                icon={<Sun aria-hidden="true" size={19} />}
                sectionHref={`/routines?date=${selected}`}
                items={morningRoutine}
                prefix="morning"
                checked={checked}
                earnedIds={page.earnedTaskKeys
                  .filter((key) =>
                    key.startsWith(`builtin:${selected}:morning-`),
                  )
                  .map((key) => key.slice(`builtin:${selected}:`.length))}
                disabled={toggleFetcher.state !== "idle"}
                onToggle={toggleTask}
              />
              <Checklist
                title="Nightly routine"
                eyebrow="WIND DOWN"
                icon={<Moon aria-hidden="true" size={19} />}
                sectionHref={`/routines?date=${selected}`}
                items={nightRoutine}
                prefix="night"
                checked={checked}
                earnedIds={page.earnedTaskKeys
                  .filter((key) =>
                    key.startsWith(`builtin:${selected}:night-`),
                  )
                  .map((key) => key.slice(`builtin:${selected}:`.length))}
                disabled={toggleFetcher.state !== "idle"}
                onToggle={toggleTask}
              />
            </div>
            )}
            {show("synced-tasks") && (
            <Checklist
              title="Google & email tasks"
              eyebrow="SYNCED TASKS"
              icon={<RefreshCw aria-hidden="true" size={19} />}
              sectionHref={`/synced-tasks?date=${selected}`}
              items={page.tasks.map((task) => task.title)}
              ids={externalIds}
              prefix="external"
              checked={externalChecked}
              earnedIds={externalEarned}
              taskLinks={page.tasks.map((task) => task.emailUrl)}
              disabled={toggleFetcher.state !== "idle"}
              onToggle={toggleTask}
            />
            )}
          </div>

          <aside className="right-column">
            {show("progress") && (
            <section className="progress-panel">
              <div>
                <Link className="eyebrow section-heading-link" to={`/progress?date=${selected}`}>DAILY PROGRESS</Link>
                <strong>
                  {completed}
                  <span> / {total} TASKS COMPLETE</span>
                </strong>
              </div>
              <div className="progress-main">
                <div className="progress-label">
                  <span>YOUR MOMENTUM</span>
                  <b>{percent}%</b>
                </div>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label="Daily quest completion"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                >
                  <div style={{ width: `${percent}%` }} />
                </div>
              </div>
              <div className="xp-total">
                <Sparkles aria-hidden="true" size={22} />
                <div>
                  <strong>{page.todayPoints} PTS</strong>
                  <small>EARNED THIS DAY</small>
                </div>
              </div>
            </section>
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
