import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { tiers, type Quest } from "../../../shared/planner/gamification";
import type { PlannerActionResult } from "../../../shared/planner/types";

const groups = [
  { kind: "side", title: "Side Quests", detail: "Quick daily or weekly tasks", points: 10 },
  { kind: "main", title: "Main Quests", detail: "Monthly or quarterly projects", points: 50 },
  { kind: "boss", title: "End-Game Bosses", detail: "Major long-term goals", points: 150 },
] as const;

export function QuestBoard({ quests, selected }: { quests: Quest[]; selected: string }) {
  const fetcher = useFetcher<PlannerActionResult>();
  const [kind, setKind] = useState<(typeof groups)[number]["kind"]>("main");
  const [points, setPoints] = useState(50);
  return (
    <div className="quest-board">
      <section className="panel quest-creator">
        <p className="eyebrow accent">YOUR NEXT ADVENTURE</p>
        <h2>Create a quest</h2>
        <p>Set your own point value to match the effort. Completed quests award points and lifetime XP once.</p>
        <fetcher.Form method="post" className="gamification-form">
          <input type="hidden" name="intent" value="create_quest" />
          <label>Quest title<input name="title" required maxLength={100} /></label>
          <label>Description (optional)<textarea name="description" maxLength={500} /></label>
          <div className="form-grid">
            <label>Quest type<select name="kind" value={kind} onChange={(event) => {
              const next = groups.find((group) => group.kind === event.target.value);
              if (next) { setKind(next.kind); setPoints(next.points); }
            }}>{groups.map((group) => <option value={group.kind} key={group.kind}>{group.title}</option>)}</select></label>
            <label>Rarity<select name="tier" defaultValue="Rare">{tiers.map((tier) => <option key={tier}>{tier}</option>)}</select></label>
            <label>Points / XP<input name="points" type="number" min="1" max="100000" required value={points} onChange={(event) => setPoints(Number(event.target.value))} /></label>
          </div>
          <button className="gamification-button primary" disabled={fetcher.state !== "idle"}>Add quest</button>
        </fetcher.Form>
        {fetcher.data?.message && <p className="quest-feedback" role="status">{fetcher.data.message}</p>}
        {fetcher.data?.error && <p className="inline-error" role="alert">{fetcher.data.error}</p>}
      </section>
      {groups.map((group) => (
        <section className="quest-group" key={group.kind}>
          <div className="profile-section-heading">
            <div><p className="eyebrow accent">{group.detail}</p><h2>{group.title}</h2></div>
          </div>
          {group.kind === "side" && <div className="quest-builtin">
            <span>Your daily quests, routines, and synced tasks are Side Quests worth 10 points each.</span>
            <Link to={`/routines?date=${selected}`}>View routines →</Link>
          </div>}
          {quests.filter((quest) => quest.kind === group.kind).map((quest) => (
            <article className="quest-card" key={quest.id}>
              <div><span className="eyebrow">{quest.tier} · {quest.points} PTS / XP</span><h3>{quest.title}</h3>{quest.description && <p>{quest.description}</p>}</div>
              <div className="quest-actions">
                {quest.completedAt ? <span className="quest-complete">COMPLETED</span> : <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="complete_quest" /><input type="hidden" name="id" value={quest.id} />
                  <button className="gamification-button primary" disabled={fetcher.state !== "idle"}>Complete</button>
                </fetcher.Form>}
                <fetcher.Form method="post" onSubmit={(event) => {
                  if (!window.confirm(`Delete "${quest.title}"? Earned points and XP will be kept.`)) event.preventDefault();
                }}>
                  <input type="hidden" name="intent" value="delete_quest" /><input type="hidden" name="id" value={quest.id} />
                  <button className="gamification-button" disabled={fetcher.state !== "idle"}>Delete</button>
                </fetcher.Form>
              </div>
            </article>
          ))}
          {group.kind !== "side" && !quests.some((quest) => quest.kind === group.kind) && <p className="profile-note">No quests here yet. Create one when you are ready.</p>}
        </section>
      ))}
    </div>
  );
}
