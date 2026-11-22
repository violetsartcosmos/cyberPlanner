import { Award, Flame, Heart, Sparkles } from "lucide-react";
import { getProfileStats } from "../../../shared/planner/profile";
import type { Achievement } from "../../../shared/planner/gamification";
import { Achievements } from "./achievements";
import { LevelHeader } from "./level-header";

type ProfileProps = {
  checks: Record<string, string[]>;
  today: string;
  balance: number;
  totalXp: number;
  achievements: Achievement[];
};

export function Profile({ checks, today, balance, totalXp, achievements }: ProfileProps) {
  const stats = getProfileStats(checks, today);
  const unlocked = achievements.filter((achievement) => achievement.unlockedAt).length;

  return (
    <div className="profile-page">
      <section className="profile-hero" aria-labelledby="profile-name">
        <div className="profile-avatar" aria-hidden="true">V</div>
        <div className="profile-intro">
          <p className="eyebrow">PLAYER PROFILE <span>// YOUR LIFE, YOUR QUEST</span></p>
          <h1 id="profile-name">Violet <Sparkles aria-hidden="true" size={23} /></h1>
          <p>Every little step is part of your story.</p>
          <ul className="profile-about">
            <li><Heart aria-hidden="true" size={14} /> Making space for self-care</li>
            <li><Sparkles aria-hidden="true" size={14} /> Building routines, one day at a time</li>
            <li><Award aria-hidden="true" size={14} /> Turning everyday tasks into quests</li>
          </ul>
        </div>
        <div className="profile-points">
          <span>AVAILABLE POINTS</span>
          <strong><Sparkles aria-hidden="true" size={18} /> {balance}</strong>
        </div>
      </section>

      <LevelHeader totalXp={totalXp} unlocked={unlocked} />
      <section className="profile-stats" aria-label="Violet's stats">
        <div><span>QUESTS COMPLETED</span><strong>{stats.completedTasks}</strong><small>Built-in tasks checked</small></div>
        <div><span>ACTIVE DAYS</span><strong>{stats.activeDays}</strong><small>Days with a built-in task</small></div>
        <div><span>CURRENT STREAK</span><strong><Flame aria-hidden="true" size={20} /> {stats.activityStreak}</strong><small>Days with a built-in task</small></div>
        <div><span>ACHIEVEMENTS</span><strong>{unlocked} <small>/ {achievements.length}</small></strong><small>Badges unlocked</small></div>
      </section>
      <Achievements achievements={achievements} />
    </div>
  );
}
