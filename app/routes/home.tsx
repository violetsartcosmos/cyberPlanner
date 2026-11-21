import type { Route } from "./+types/home";
import { Checklist } from "../components/checklist";
import { MissionCalendar } from "../components/mission-calendar";
import { dailyQuests, morningRoutine, nightRoutine, rewards } from "../planner";
import {
  dayProgress,
  parseDate,
  weekdayIndex,
  weekdays,
} from "../planner-utils";
import { usePlanner } from "../use-planner";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "CyberPlanner | Your life, your quest" },
    {
      name: "description",
      content: "A little structure for a more intentional life.",
    },
  ];
}

export default function Home() {
  const {
    selected,
    setSelected,
    today,
    data,
    storageError,
    toggle,
    setNote,
    goToToday,
  } = usePlanner();

  if (!selected)
    return <main className="loading">INITIALIZING YOUR PLANNER...</main>;

  const date = parseDate(selected);
  const weekday = weekdayIndex(date);
  const quest = dailyQuests[weekday];
  const checked = data.checks[selected] ?? [];
  const { total, completed, percent } = dayProgress(date, checked);

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
          <span className="top-date">
            {date
              .toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
              .toUpperCase()}
          </span>
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

        {storageError && (
          <div className="storage-error" role="alert">
            {storageError}
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
            <span>✦ {completed * 10} XP</span>
          </div>
        </section>

        <div className="dashboard-grid">
          <aside className="left-column">
            <MissionCalendar
              date={date}
              selected={selected}
              today={today}
              checks={data.checks}
              onSelect={setSelected}
              onToday={goToToday}
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
                <div className="progress-track">
                  <div style={{ width: `${percent}%` }} />
                </div>
              </div>
              <div className="xp-total">
                <span>✦</span>
                <div>
                  <strong>{completed * 10} XP</strong>
                  <small>FOR THIS DAY</small>
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
              onToggle={toggle}
            />
            <div className="routine-grid">
              <Checklist
                title="Morning routine"
                eyebrow="RISE & SHINE"
                icon="☼"
                items={morningRoutine}
                prefix="morning"
                checked={checked}
                onToggle={toggle}
              />
              <Checklist
                title="Nightly routine"
                eyebrow="WIND DOWN"
                icon="☾"
                items={nightRoutine}
                prefix="night"
                checked={checked}
                onToggle={toggle}
              />
            </div>
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
            <section className="panel rewards-panel">
              <div className="section-label">
                <span>04 / REWARDS</span>
                <span>✧</span>
              </div>
              <h2>Celebrate the wins.</h2>
              <p>Good work deserves a little joy.</p>
              <div className="reward-list">
                {rewards.map((reward, index) => (
                  <div key={reward}>
                    <span>
                      {
                        [
                          "✦",
                          "◈",
                          "♥",
                          "✧",
                          "☼",
                          "♪",
                          "▣",
                          "★",
                          "✿",
                          "◆",
                          "☻",
                          "✺",
                        ][index]
                      }
                    </span>
                    {reward}
                  </div>
                ))}
              </div>
              <div className="reward-note">
                PICK A REWARD THAT FEELS GOOD <span>↗</span>
              </div>
            </section>
            <section className="panel notes-panel">
              <div className="section-label">
                <span>05 / BRAIN DUMP</span>
                <span>✎</span>
              </div>
              <h2>Notes to self.</h2>
              <label className="sr-only" htmlFor="notes">
                Notes for {selected}
              </label>
              <textarea
                id="notes"
                placeholder="What's on your mind?"
                value={data.notes[selected] ?? ""}
                onChange={(event) => setNote(event.target.value)}
              />
              <p>SAVED ON THIS DEVICE</p>
            </section>
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
