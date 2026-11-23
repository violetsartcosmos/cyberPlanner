import { useEffect } from "react";
import { Award, Flame, Heart, Sparkles } from "lucide-react";
import { useLocation } from "react-router";
import { getProfileStats } from "../../../../shared/planner/profile";
import type { Achievement } from "../../../../shared/planner/gamification";
import { AchievementPreview, Achievements } from "./achievements";
import { LevelHeader } from "./level-header";
import witchyPonder from "@/assets/images/witchyponder.png";

type ProfileProps = {
  checks: Record<string, string[]>;
  selected: string;
  today: string;
  balance: number;
  totalXp: number;
  achievements: Achievement[];
};

export function Profile({ checks, selected, today, balance, totalXp, achievements }: ProfileProps) {
  const { hash } = useLocation();
  const stats = getProfileStats(checks, today);
  let unlocked = 0;
  for (const achievement of achievements) {
    if (achievement.unlockedAt) unlocked += 1;
  }

  useEffect(function showAchievements() {
    if (hash === "#achievements") document.getElementById("achievements")?.scrollIntoView();
  }, [hash]);

  return (
    <div className="profile-page">
      <div className="profile-summary">
        <section className="profile-hero" aria-labelledby="profile-name">
          <div className="profile-intro">
            <p className="eyebrow">PLAYER PROFILE <span>// YOUR LIFE, YOUR QUEST</span></p>
            <h1 id="profile-name">Violet <Sparkles aria-hidden="true" size={23} /></h1>
            <p>Every little step is part of your story.</p>
            <ul className="profile-about">
              <li><Sparkles aria-hidden="true" size={14} /> Building routines, one day at a time</li>
            </ul>
          </div>
          <div className="profile-points">
            <span>AVAILABLE POINTS</span>
            <strong><Sparkles aria-hidden="true" size={18} /> {balance}</strong>
          </div>
          <div className="profile-art" aria-hidden="true">
            <img src={witchyPonder} alt="" />
          </div>
        </section>
        <AchievementPreview achievements={achievements} selected={selected} onProfile />
      </div>

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
