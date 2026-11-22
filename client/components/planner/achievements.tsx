import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import {
  Award, Bug, CalendarCheck, Check, Clock, Compass, Droplet, Dumbbell,
  Flame, FolderCheck, GitPullRequest, GraduationCap, Layers, MailCheck,
  MapPin, Mic, Moon, PowerOff, Rocket, Send, Shield, Sparkles, Sunrise,
  Sword, Terminal, Trees, Trophy, Utensils,
} from "lucide-react";
import { useFetcher } from "react-router";
import { morningRoutine, nightRoutine } from "../../../shared/planner/definitions";
import { achievementCategories, tiers, type Achievement } from "../../../shared/planner/gamification";
import type { PlannerActionResult } from "../../../shared/planner/types";

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

function buildIndexedOptions(values: readonly string[], prefix: string) {
  const options: ReactNode[] = [];
  for (let index = 0; index < values.length; index += 1) {
    options.push(
      <option value={`${prefix}-${index}`} key={index}>
        {values[index]}
      </option>,
    );
  }
  return options;
}

function AchievementDialog({ achievement, onClose, fetcher, onSubmit, error }: {
  achievement: Achievement | null;
  onClose: () => void;
  fetcher: ReturnType<typeof useFetcher<PlannerActionResult>>;
  onSubmit: () => void;
  error: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tracking, setTracking] = useState(achievement?.tracking ?? "manual");
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
        <h2 id="achievement-dialog-title">{achievement ? "Edit achievement" : "Create achievement"}</h2>
        <button type="button" className="gamification-button" onClick={closeDialog}>Close</button>
      </div>
      <fetcher.Form method="post" className="gamification-form" onSubmit={onSubmit}>
        <input type="hidden" name="intent" value="save_achievement" />
        <input type="hidden" name="id" value={achievement?.id ?? ""} />
        <label>Title<input name="title" required maxLength={100} defaultValue={achievement?.title} /></label>
        <label>Description<textarea name="description" required maxLength={500} defaultValue={achievement?.description} /></label>
        <div className="form-grid">
          <label>Category<select name="category" defaultValue={achievement?.category ?? achievementCategories[0]}>{buildOptions(achievementCategories)}</select></label>
          <label>Tier<select name="tier" defaultValue={achievement?.tier ?? "Common"}>{buildOptions(tiers)}</select></label>
          <label>XP reward<input name="xp" type="number" min="1" max="100000" required defaultValue={achievement?.xp ?? 25} /></label>
          <label>Target (days or steps)<input name="target" type="number" min="1" max="3650" required defaultValue={achievement?.target ?? 1} /></label>
        </div>
        <label>Progress tracking
          <select name="tracking" value={tracking} onChange={handleTrackingChange}>
            <option value="manual">Manual (+1)</option>
            <option value="streak">Consecutive routine days</option>
          </select>
        </label>
        {tracking === "streak" && <label>Routine task
          <select name="taskId" defaultValue={achievement?.taskId ?? "morning-0"}>
            <optgroup label="Morning">{buildIndexedOptions(morningRoutine, "morning")}</optgroup>
            <optgroup label="Night">{buildIndexedOptions(nightRoutine, "night")}</optgroup>
          </select>
        </label>}
        <label>Personal reward (optional)<input name="reward" maxLength={200} placeholder="A treat, downtime, or something special" defaultValue={achievement?.reward ?? ""} /></label>
        <p className="form-hint">Unlocked achievements keep their earned XP, even if edited or deleted. Changing a tracking method resets unfinished progress.</p>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <button className="gamification-button primary" type="submit" disabled={fetcher.state !== "idle"}>Save achievement</button>
      </fetcher.Form>
    </dialog>
  );
}

export function Achievements({ achievements }: { achievements: Achievement[] }) {
  const fetcher = useFetcher<PlannerActionResult>();
  const [category, setCategory] = useState("all");
  const [tier, setTier] = useState("all");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Achievement | "new" | null>(null);
  const [notice, setNotice] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [noticeIsError, setNoticeIsError] = useState(false);
  const pending = useRef<"save" | "other" | null>(null);

  useEffect(function syncAchievementFetcher() {
    if (fetcher.state !== "idle" || !fetcher.data || !pending.current) return;
    if (fetcher.data.ok) {
      if (pending.current === "save") setEditing(null);
      setDialogError("");
      setNoticeIsError(false);
      setNotice(fetcher.data.unlockedAchievements?.length
        ? `Achievement unlocked: ${fetcher.data.unlockedAchievements.join(", ")}!`
        : fetcher.data.message ?? "Progress saved.");
    } else {
      const error = fetcher.data.error ?? "Could not save your changes.";
      if (pending.current === "save") setDialogError(error);
      else { setNotice(error); setNoticeIsError(true); }
    }
    pending.current = null;
  }, [fetcher.state, fetcher.data]);

  function openNewAchievement() {
    setDialogError("");
    setEditing("new");
  }

  function dismissNotice() {
    setNotice("");
  }

  function handleCategoryChange(event: ChangeEvent<HTMLSelectElement>) {
    setCategory(event.target.value);
  }

  function handleTierChange(event: ChangeEvent<HTMLSelectElement>) {
    setTier(event.target.value);
  }

  function handleStatusChange(event: ChangeEvent<HTMLSelectElement>) {
    setStatus(event.target.value);
  }

  function editAchievement(achievement: Achievement) {
    setDialogError("");
    setEditing(achievement);
  }

  function closeEditing() {
    setEditing(null);
  }

  function markSavePending() {
    setDialogError("");
    pending.current = "save";
  }

  function markOtherPending() {
    pending.current = "other";
  }

  function confirmAchievementDelete(title: string) {
    return function handleDelete(event: FormEvent<HTMLFormElement>) {
      if (!window.confirm(`Delete "${title}"? Earned XP will be kept.`)) {
        event.preventDefault();
      } else {
        pending.current = "other";
      }
    };
  }

  function createEditAchievementHandler(achievement: Achievement) {
    return function handleEditAchievement() {
      editAchievement(achievement);
    };
  }

  const filtered: Achievement[] = [];
  let unlocked = 0;
  for (const achievement of achievements) {
    if (achievement.unlockedAt) unlocked += 1;
    if (
      (category === "all" || achievement.category === category) &&
      (tier === "all" || achievement.tier === tier) &&
      (status === "all" || (status === "unlocked") === Boolean(achievement.unlockedAt))
    ) {
      filtered.push(achievement);
    }
  }

  const achievementCards: ReactNode[] = [];
  for (const achievement of filtered) {
    const Icon = icons[achievement.icon] ?? Award;
    achievementCards.push(
      <article className={`achievement-card tier-${achievement.tier.toLowerCase()} ${achievement.unlockedAt ? "is-unlocked" : ""}`} key={achievement.id}>
        <div className="achievement-icon"><Icon aria-hidden="true" size={30} /></div>
        <div className="achievement-copy">
          <span className="achievement-status">{achievement.unlockedAt ? <><Check aria-hidden="true" size={13} /> UNLOCKED</> : "LOCKED"} · {achievement.tier.toUpperCase()} · {achievement.unlockedAt ? achievement.awardedXp : achievement.xp} XP</span>
          <h3>{achievement.title}</h3>
          <p>{achievement.description}</p>
          <p className="achievement-category">{achievement.category}</p>
          {achievement.reward && <p className="achievement-reward">{achievement.unlockedAt ? "Your reward" : "Reward on unlock"}: {achievement.reward}</p>}
          <div className="achievement-progress">
            <div className="achievement-track" role="progressbar" aria-label={`${achievement.title} progress`} aria-valuemin={0} aria-valuemax={achievement.target} aria-valuenow={achievement.current}><span style={{ width: `${achievement.current / achievement.target * 100}%` }} /></div>
            <span>{achievement.current} / {achievement.target}</span>
          </div>
          <div className="achievement-actions">
            {!achievement.unlockedAt && achievement.tracking === "manual" && <fetcher.Form method="post" onSubmit={markOtherPending}>
              <input type="hidden" name="intent" value="advance_achievement" /><input type="hidden" name="id" value={achievement.id} />
              <button className="gamification-button primary" disabled={fetcher.state !== "idle"}>{achievement.target === 1 ? "Unlock" : "+1 progress"}</button>
            </fetcher.Form>}
            {!achievement.unlockedAt && achievement.tracking === "streak" && <span className="form-hint">Automatic routine streak</span>}
            <button className="gamification-button" type="button" onClick={createEditAchievementHandler(achievement)}>Edit</button>
            <fetcher.Form method="post" onSubmit={confirmAchievementDelete(achievement.title)}>
              <input type="hidden" name="intent" value="delete_achievement" /><input type="hidden" name="id" value={achievement.id} />
              <button className="gamification-button" disabled={fetcher.state !== "idle"}>Delete</button>
            </fetcher.Form>
          </div>
        </div>
      </article>,
    );
  }

  return (
    <section className="profile-achievements" aria-labelledby="achievements-heading">
      <div className="profile-section-heading">
        <div>
          <p className="eyebrow accent">YOUR WINS // KEEP GOING</p>
          <h2 id="achievements-heading">Achievements &amp; badges</h2>
          <p>{unlocked} / {achievements.length} unlocked. Little victories deserve to be celebrated.</p>
        </div>
        <button className="gamification-button primary" onClick={openNewAchievement}>+ New achievement</button>
      </div>
      {notice && <div className="achievement-notice" role={noticeIsError ? "alert" : "status"}>{notice}<button type="button" aria-label="Dismiss notification" onClick={dismissNotice}>×</button></div>}
      <div className="achievement-filters">
        <label>Category<select value={category} onChange={handleCategoryChange}><option value="all">All categories</option>{buildOptions(achievementCategories)}</select></label>
        <label>Tier<select value={tier} onChange={handleTierChange}><option value="all">All tiers</option>{buildOptions(tiers)}</select></label>
        <label>Status<select value={status} onChange={handleStatusChange}><option value="all">All achievements</option><option value="locked">Locked</option><option value="unlocked">Unlocked</option></select></label>
      </div>
      <div className="achievement-grid">
        {achievementCards}
      </div>
      {filtered.length === 0 && <p className="profile-note">No achievements match these filters.</p>}
      <p className="profile-note">Manual goals are self-reported, including any time limits in their descriptions. Routine streaks unlock automatically. Unlocked badges and earned XP are permanent.</p>
      {editing && <AchievementDialog key={editing === "new" ? "new" : editing.id} achievement={editing === "new" ? null : editing} fetcher={fetcher} error={dialogError} onClose={closeEditing} onSubmit={markSavePending} />}
    </section>
  );
}
