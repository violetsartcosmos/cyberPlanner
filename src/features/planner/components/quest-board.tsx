import { useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { Link, useFetcher } from "react-router";
import { tiers, type Quest } from "../../../../shared/planner/gamification";
import type { PlannerActionResult } from "../../../../shared/planner/types";
import witchyAction from "@/assets/images/witchyaction.png";

const groups = [
  { kind: "side", title: "Side Quests", detail: "Quick daily or weekly tasks", points: 10 },
  { kind: "main", title: "Main Quests", detail: "Monthly or quarterly projects", points: 50 },
  { kind: "boss", title: "End-Game Bosses", detail: "Major long-term goals", points: 150 },
] as const;

export function QuestBoard({ quests, selected }: { quests: Quest[]; selected: string }) {
  const fetcher = useFetcher<PlannerActionResult>();
  const [kind, setKind] = useState<(typeof groups)[number]["kind"]>("main");
  const [points, setPoints] = useState(50);

  function handleKindChange(event: ChangeEvent<HTMLSelectElement>) {
    for (const group of groups) {
      if (group.kind === event.target.value) {
        setKind(group.kind);
        setPoints(group.points);
        return;
      }
    }
  }

  function handlePointsChange(event: ChangeEvent<HTMLInputElement>) {
    setPoints(Number(event.target.value));
  }

  function confirmQuestDelete(title: string) {
    return function handleDelete(event: FormEvent<HTMLFormElement>) {
      if (!window.confirm(`Delete "${title}"? Earned points and XP will be kept.`)) {
        event.preventDefault();
      }
    };
  }

  const groupOptions: ReactNode[] = [];
  for (const group of groups) {
    groupOptions.push(
      <option value={group.kind} key={group.kind}>{group.title}</option>,
    );
  }

  const tierOptions: ReactNode[] = [];
  for (const tier of tiers) {
    tierOptions.push(<option key={tier}>{tier}</option>);
  }

  const questSections: ReactNode[] = [];
  for (const group of groups) {
    const questsInGroup: ReactNode[] = [];
    let hasQuestInGroup = false;
    for (const quest of quests) {
      if (quest.kind !== group.kind) continue;
      hasQuestInGroup = true;
      questsInGroup.push(
        <article className="quest-card" key={quest.id}>
          <div><span className="text-label">{quest.tier} · {quest.points} PTS / XP</span><h3>{quest.title}</h3>{quest.description && <p>{quest.description}</p>}</div>
          <div className="quest-actions">
            {quest.completedAt ? <span className="quest-complete">COMPLETED</span> : <fetcher.Form method="post">
              <input type="hidden" name="intent" value="complete_quest" /><input type="hidden" name="id" value={quest.id} />
              <button className="btn btn-primary btn-sm" disabled={fetcher.state !== "idle"}>Complete</button>
            </fetcher.Form>}
            <fetcher.Form method="post" onSubmit={confirmQuestDelete(quest.title)}>
              <input type="hidden" name="intent" value="delete_quest" /><input type="hidden" name="id" value={quest.id} />
              <button className="btn btn-outline-secondary btn-sm" disabled={fetcher.state !== "idle"}>Delete</button>
            </fetcher.Form>
          </div>
        </article>,
      );
    }
    questSections.push(
      <section className="quest-group" key={group.kind}>
        <div className="profile-section-heading">
          <div><p className="text-label accent">{group.detail}</p><h2>{group.title}</h2></div>
        </div>
        {group.kind === "side" && <div className="quest-builtin">
          <span>Your daily quests, routines, and synced tasks are Side Quests worth 10 points each.</span>
          <Link to={`/quests?date=${selected}#routines`}>View routines →</Link>
        </div>}
        {questsInGroup}
        {group.kind !== "side" && !hasQuestInGroup && <p className="profile-note">No quests here yet. Create one when you are ready.</p>}
      </section>,
    );
  }

  return (
    <div className="quest-board">
      <section className="card p-3 quest-creator">
        <div className="quest-creator-copy">
          <p className="text-label accent">YOUR NEXT ADVENTURE</p>
          <h2>Create a quest</h2>
          <p>Set your own point value to match the effort. Completed quests award points and lifetime XP once.</p>
          <fetcher.Form method="post" className="gamification-form">
            <input type="hidden" name="intent" value="create_quest" />
            <label>Quest title<input className="form-control" name="title" required maxLength={100} /></label>
            <label>Description (optional)<textarea className="form-control" name="description" maxLength={500} /></label>
            <div className="row g-2">
              <label className="col-12 col-md-4">Quest type<select className="form-select" name="kind" value={kind} onChange={handleKindChange}>{groupOptions}</select></label>
              <label className="col-12 col-md-4">Rarity<select className="form-select" name="tier" defaultValue="Rare">{tierOptions}</select></label>
              <label className="col-12 col-md-4">Points / XP<input className="form-control" name="points" type="number" min="1" max="100000" required value={points} onChange={handlePointsChange} /></label>
            </div>
            <button className="btn btn-primary btn-sm" disabled={fetcher.state !== "idle"}>Add quest</button>
          </fetcher.Form>
          {fetcher.data?.message && <p className="quest-feedback" role="status">{fetcher.data.message}</p>}
          {fetcher.data?.error && <p className="inline-error" role="alert">{fetcher.data.error}</p>}
        </div>
        <img className="quest-creator-art" src={witchyAction} alt="" />
      </section>
      {questSections}
    </div>
  );
}
