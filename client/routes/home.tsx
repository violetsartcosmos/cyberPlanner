import { useEffect, useState } from "react";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { Checklist } from "../components/planner/checklist";
import { GoogleIntegrationPanel } from "../components/google/integration-panel";
import { MissionCalendar } from "../components/planner/mission-calendar";
import { NotesEditor } from "../components/planner/notes-editor";
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
  return response.json() as Promise<PlannerPage>;
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
  const toggleFetcher = useFetcher<PlannerActionResult>();
  const [today, setToday] = useState(page.authenticated ? page.today : "");

  useEffect(() => {
    if (!page.authenticated) return;
    const localToday = dateKey(new Date());
    setToday(localToday);
    if (!new URLSearchParams(window.location.search).has("date")) {
      if (localToday !== page.today) {
        navigate(`/?date=${localToday}`, { replace: true });
      }
    }
  }, [navigate, page]);

  if (!page.authenticated) {
    return (
      <SignInPanel
        missingConfiguration={page.missingConfiguration}
        authError={page.authError}
      />
    );
  }

  const selected = page.selected;
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
    navigate(`/?date=${next}`);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="CyberPlanner home">
          <span className="brand-mark">✳</span>
          <span>
            CYBER<span>PLANNER</span>
            <small>LIFE MANAGEMENT SYSTEM</small>
          </span>
        </a>
        <div className="topbar-right">
          <span className="status">
            <i /> SYSTEM ONLINE
          </span>
          <span className="wallet-balance" aria-label={`${page.balance} points`}>
            ✦ {page.balance} PTS
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

      <main className="dashboard">
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
            <span>✦</span> BE AGGRESSIVELY KIND{" "}
            <small>TO YOURSELF, ALWAYS.</small>
          </div>
        </div>
        {toggleFetcher.data?.error && (
          <div className="storage-error" role="alert">
            {toggleFetcher.data.error}
          </div>
        )}

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
            <span>✦ {page.todayPoints} PTS EARNED</span>
          </div>
        </section>

        <div className="dashboard-grid">
          <aside className="left-column">
            <MissionCalendar
              date={date}
              selected={selected}
              today={today || page.today}
              checks={page.checks}
              onSelect={selectDate}
              onToday={() => selectDate(today || page.today)}
            />
            <section className="panel week-panel">
              <div className="section-label">
                <span>02 / WEEKLY PROTOCOL</span>
                <span>✦</span>
              </div>
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
                    <b>{index === weekday ? "↗" : "·"}</b>
                  </div>
                ))}
              </div>
            </section>
            <div className="side-quote">
              <span>✳</span> PROGRESS, NOT PERFECTION.
              <br />
              <small>YOU ARE ALREADY DOING ENOUGH.</small>
            </div>
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
                  <span>◆</span> DAILY QUEST ACTIVE
                </div>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="hero-star">✳</div>
                <span className="hero-art-label">
                  LIFE IS THE
                  <br />
                  MAIN QUEST
                </span>
                <span className="hero-art-index">✦ 001 / 007</span>
              </div>
            </section>
            <section className="progress-panel">
              <div>
                <p className="eyebrow">DAILY PROGRESS</p>
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
                <span>✦</span>
                <div>
                  <strong>{page.todayPoints} PTS</strong>
                  <small>EARNED THIS DAY</small>
                </div>
              </div>
            </section>
            <Checklist
              title={quest.title}
              eyebrow="YOUR DAILY QUESTS"
              icon="✦"
              items={quest.tasks}
              prefix="daily"
              checked={checked}
              earnedIds={page.earnedTaskKeys
                .filter((key) => key.startsWith(`builtin:${selected}:`))
                .map((key) => key.slice(`builtin:${selected}:`.length))}
              disabled={toggleFetcher.state !== "idle"}
              onToggle={toggleTask}
            />
            <div className="routine-grid">
              <Checklist
                title="Morning routine"
                eyebrow="RISE & SHINE"
                icon="☼"
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
                icon="☾"
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
            <Checklist
              title="Google & email tasks"
              eyebrow="SYNCED TASKS"
              icon="↻"
              items={page.tasks.map((task) => task.title)}
              ids={externalIds}
              prefix="external"
              checked={externalChecked}
              earnedIds={externalEarned}
              taskLinks={page.tasks.map((task) => task.emailUrl)}
              disabled={toggleFetcher.state !== "idle"}
              onToggle={toggleTask}
            />
          </div>

          <aside className="right-column">
            <section className="panel motivation-panel">
              <div className="section-label">
                <span>03 / A LITTLE REMINDER</span>
                <span>✦</span>
              </div>
              <div className="pixel-heart">♥</div>
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
                SELF-KINDNESS IS A SUPERPOWER <span>↗</span>
              </div>
            </section>
            <RewardShop balance={page.balance} redemptions={page.redemptions} />
            <GoogleIntegrationPanel email={page.email} selected={selected} />
            <NotesEditor selected={selected} note={page.note} />
          </aside>
        </div>
        <footer>
          <span>
            CYBERPLANNER <b>✳</b> YOUR LIFE, YOUR QUEST.
          </span>
          <span>BUILT FOR THE BEAUTIFULLY HUMAN EXPERIENCE</span>
        </footer>
      </main>
    </div>
  );
}
