import { Sparkles } from "lucide-react";
import { levelProgress } from "../../../../shared/planner/profile";

export function LevelHeader({ totalXp, earned }: { totalXp: number; earned: number }) {
  const level = levelProgress(totalXp);
  return (
    <section className="level-header" aria-label="Level and experience">
      <div className="level-emblem"><Sparkles aria-hidden="true" size={20} /><strong>LVL {level.level}</strong></div>
      <div className="level-progress">
        <div><span>YOUR NEXT LEVEL</span><strong>{level.current} / {level.target} XP</strong></div>
        <div className="progress" role="progressbar" aria-label="XP toward next level" aria-valuemin={0} aria-valuemax={level.target} aria-valuenow={level.current}>
          <div className="progress-bar" style={{ width: `${level.current / level.target * 100}%` }} />
        </div>
      </div>
      <div className="level-totals"><strong>{totalXp} XP</strong><span>{earned} ACHIEVEMENTS EARNED</span></div>
    </section>
  );
}
