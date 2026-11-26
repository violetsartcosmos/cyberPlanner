import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  Award, Bug, CalendarCheck, Check, Clock, Compass, Droplet, Dumbbell,
  Flame, FolderCheck, GitPullRequest, GraduationCap, Layers, MailCheck,
  MapPin, Mic, Moon, PowerOff, Rocket, Send, Shield, Sparkles, Sunrise,
  Sword, Terminal, Trees, Trophy, Utensils,
} from "lucide-react";
import { useFetcher } from "react-router";
import { achievementCategories, tiers, type Achievement } from "../../../../shared/planner/gamification";
import { routinesFor, type RoutineTask } from "../../../../shared/planner/routines";
import type { AchievementActionResult } from "../../../../shared/planner/types";
import { useNotification } from "@/components/notifications";

const icons: Record<string, typeof Award> = {
  award: Award, bug: Bug, "calendar-check": CalendarCheck, clock: Clock,
  compass: Compass, droplet: Droplet, dumbbell: Dumbbell, flame: Flame,
  "folder-check": FolderCheck, "git-pull-request": GitPullRequest,
  "graduation-cap": GraduationCap, layers: Layers, "mail-check": MailCheck,
  "map-pin": MapPin, mic: Mic, moon: Moon, "power-off": PowerOff,
  rocket: Rocket, send: Send, shield: Shield, sparkles: Sparkles,
  sunrise: Sunrise, sword: Sword, terminal: Terminal, trees: Trees,
  trophy: Trophy, utensils: Utensils,
} as const;

function buildOptions(values: readonly string[]) {
  const options: ReactNode[] = [];
  for (const value of values) {
    options.push(<option key={value}>{value}</option>);
  }
  return options;
}

function buildRoutineOptions(routines: RoutineTask[], list: "morning" | "night") {
  return routinesFor(routines, list, null).map((routine) => (
    <option value={routine.id} key={routine.id}>
      {routine.title}
    </option>
  ));
}

export function AchievementPreview({ achievements }: { achievements: Achievement[] }) {
  const earned = achievements.filter((achievement) => achievement.earnedAt);
  const featured = [...achievements]
    .sort((firstAchievement, secondAchievement) => Number(Boolean(secondAchievement.earnedAt)) - Number(Boolean(firstAchievement.earnedAt)))
    .slice(0, 4);

  return (
    <section className="card p-3 achievement-preview" aria-labelledby="achievement-preview-heading">
      <div className="achievement-preview-heading">
        <div>
          <p className="text-label">YOUR WINS</p>
          <h2 className="h5" id="achievement-preview-heading">Achievements</h2>
        </div>
      </div>
      <p className="achievement-preview-count">{earned.length} / {achievements.length} EARNED</p>
      {featured.length > 0 ? (
        <div className="achievement-preview-grid">
          {featured.map((achievement) => {
            const Icon = icons[achievement.icon] ?? Award;
            return (
              <div className={`achievement-preview-card ${achievement.earnedAt ? "is-earned" : ""}`} key={achievement.id}>
                <span className="achievement-preview-icon"><Icon aria-hidden="true" size={25} /></span>
                <strong>{achievement.title}</strong>
                <span>{achievement.earnedAt ? "EARNED" : `${achievement.current} / ${achievement.target}`}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="profile-note">No achievements yet. Visit your profile to create one.</p>
      )}
    </section>
  );
}

/**
 * Collects a points or routine-streak goal for the achievement creation action.
 * @param props - The dialog callbacks, resource fetcher and available routines.
 * @returns The achievement form and modal controls.
 */
function AchievementDialog({ onClose, fetcher, onSubmit, routines }: {
  onClose: () => void;
  fetcher: ReturnType<typeof useFetcher<AchievementActionResult>>;
  onSubmit: () => void;
  routines: RoutineTask[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tracking, setTracking] = useState("points");
  useEffect(function syncDialogVisibility() {
    dialog.current?.showModal();
  }, []);

  function closeDialog() {
    dialog.current?.close();
  }

  function handleTrackingChange(event: ChangeEvent<HTMLSelectElement>) {
    setTracking(event.target.value);
  }

  return (
    <dialog ref={dialog} className="achievement-dialog" onClose={onClose} aria-labelledby="achievement-dialog-title">
      <div className="dialog-heading">
        <h2 id="achievement-dialog-title">Create achievement</h2>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={closeDialog}>Close</button>
      </div>
      <fetcher.Form method="post" action="/profile/achievements" className="gamification-form" onSubmit={onSubmit}>
        <label>Title<input className="form-control" name="title" required maxLength={100} /></label>
        <label>Description<textarea className="form-control" name="description" required maxLength={500} /></label>
        <div className="row g-2">
          <label className="col-12 col-md-4">Category<select className="form-select" name="category" defaultValue={achievementCategories[0]}>{buildOptions(achievementCategories)}</select></label>
          <label className="col-12 col-md-4">Tier<select className="form-select" name="tier" defaultValue="Common">{buildOptions(tiers)}</select></label>
          <label className="col-12 col-md-4">XP reward<input className="form-control" name="xp" type="number" min="1" max="100000" required defaultValue={25} /></label>
          <label className="col-12 col-md-4">Target (points or days)<input className="form-control" name="target" type="number" min="1" max="3650" required defaultValue={1} /></label>
        </div>
        <label>Progress tracking
          <select className="form-select" name="tracking" value={tracking} onChange={handleTrackingChange}>
            <option value="points">Lifetime task points</option>
            <option value="streak">Consecutive routine days</option>
          </select>
        </label>
        {tracking === "streak" && <label>Routine task
          <select className="form-select" name="taskId">
            <optgroup label="Morning">{buildRoutineOptions(routines, "morning")}</optgroup>
            <optgroup label="Night">{buildRoutineOptions(routines, "night")}</optgroup>
          </select>
        </label>}
        <label>Personal reward (optional)<input className="form-control" name="reward" maxLength={200} placeholder="A treat, downtime, or something special" /></label>
        <p className="form-hint">Points goals use lifetime earned task points. Routine streaks award XP at each new milestone. Existing achievements cannot be edited.</p>
        <button className="btn btn-primary btn-sm" type="submit" disabled={fetcher.state !== "idle"}>Save achievement</button>
      </fetcher.Form>
    </dialog>
  );
}

/**
 * Browses achievements and reports creation feedback, including immediate milestones.
 * @param props - The achievement list, lifetime points and tracked routines.
 * @returns Filtered cards and the achievement creation dialog.
 */
export function Achievements({ achievements, earned, routines }: {
  achievements: Achievement[];
  earned: number;
  routines: RoutineTask[];
}) {
  const fetcher = useFetcher<AchievementActionResult>();
  const [filters, setFilters] = useState({ category: "all", tier: "all", status: "all" });
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [noticeIsError, setNoticeIsError] = useState(false);
  useNotification(dialogError);
  useNotification(notice, noticeIsError ? "error" : "notice");
  const pending = useRef<"save" | "other" | null>(null);

  useEffect(function syncAchievementFetcher() {
    if (fetcher.state !== "idle" || !fetcher.data || !pending.current) return;
    if (fetcher.data.status >= 200 && fetcher.data.status < 300) {
      if (pending.current === "save") setEditing(false);
      setDialogError("");
      setNoticeIsError(false);
      setNotice(fetcher.data.earnedAchievements?.length
        ? `Achievement milestone earned: ${fetcher.data.earnedAchievements.join(", ")}!`
        : fetcher.data.message as string);
    } else {
      const error = fetcher.data.error as string;
      if (pending.current === "save") setDialogError(error);
      else { setNotice(error); setNoticeIsError(true); }
    }
    pending.current = null;
  }, [fetcher.state, fetcher.data]);

  function openNewAchievement() {
    setDialogError("");
    setEditing(true);
  }

  function handleFilterChange(event: ChangeEvent<HTMLSelectElement>) {
    const { name, value } = event.currentTarget;
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function closeEditing() {
    setEditing(false);
  }

  function markSavePending() {
    setDialogError("");
    setNotice("");
    pending.current = "save";
  }

  const matchingAchievements = achievements.filter((achievement) => {
    const achievementStatus = achievement.earnedAt ? "earned" : "progress";
    return (filters.category === "all" || achievement.category === filters.category)
      && (filters.tier === "all" || achievement.tier === filters.tier)
      && (filters.status === "all" || achievementStatus === filters.status);
  });

  function renderAchievement(achievement: Achievement) {
    const Icon = icons[achievement.icon] ?? Award;
    return (
      <div className="col" key={achievement.id}>
        <article className={`achievement-card h-100 tier-${achievement.tier.toLowerCase()} ${achievement.earnedAt ? "is-earned" : ""}`}>
          <div className="achievement-icon"><Icon aria-hidden="true" size={30} /></div>
          <div className="achievement-copy">
            <span className="achievement-status">{achievement.earnedAt ? <><Check aria-hidden="true" size={13} /> EARNED</> : "IN PROGRESS"} · {achievement.tier.toUpperCase()} · {achievement.earnedAt ? achievement.awardedXp : achievement.xp} XP</span>
            <h3>{achievement.title}</h3>
            <p>{achievement.description}</p>
            <p className="achievement-category">{achievement.category}</p>
            <p className="form-hint">{achievement.tracking === "points" ? "Lifetime task points" : `Next streak milestone · ${achievement.xp} XP`}</p>
            {achievement.reward && <p className="achievement-reward">{achievement.earnedAt ? "Your reward" : "Reward when earned"}: {achievement.reward}</p>}
            <div className="achievement-progress">
              <div className="progress flex-grow-1" role="progressbar" aria-label={`${achievement.title} progress`} aria-valuemin={0} aria-valuemax={achievement.target} aria-valuenow={achievement.current}><div className="progress-bar" style={{ width: `${achievement.current / achievement.target * 100}%` }} /></div>
              <span>{achievement.current} / {achievement.target}</span>
            </div>
          </div>
        </article>
      </div>
    );
  }

  return (
    <section className="profile-achievements" id="achievements" aria-labelledby="achievements-heading">
      <div className="profile-section-heading">
        <div>
          <p className="text-label accent">YOUR WINS // KEEP GOING</p>
          <h2 id="achievements-heading">Achievements</h2>
          <p>{earned} / {achievements.length} earned. Little victories deserve to be celebrated.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openNewAchievement}>+ New achievement</button>
      </div>
      <div className="achievement-filters">
        <label>Category<select className="form-select" name="category" value={filters.category} onChange={handleFilterChange}><option value="all">All categories</option>{buildOptions(achievementCategories)}</select></label>
        <label>Tier<select className="form-select" name="tier" value={filters.tier} onChange={handleFilterChange}><option value="all">All tiers</option>{buildOptions(tiers)}</select></label>
        <label>Status<select className="form-select" name="status" value={filters.status} onChange={handleFilterChange}><option value="all">All achievements</option><option value="progress">In progress</option><option value="earned">Earned</option></select></label>
      </div>
      <div className="row row-cols-1 row-cols-lg-2 row-cols-xl-3 g-3">
        {matchingAchievements.map(renderAchievement)}
      </div>
      {matchingAchievements.length === 0 && <p className="profile-note">No achievements match these filters.</p>}
      {editing && <AchievementDialog fetcher={fetcher} onClose={closeEditing} onSubmit={markSavePending} routines={routines} />}
    </section>
  );
}
