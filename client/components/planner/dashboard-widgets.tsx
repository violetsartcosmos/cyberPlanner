import { Sparkles } from "lucide-react";

const affirmations = [
  "You are enough, exactly as you are.",
  "Small steps are still progress.",
  "You deserve kindness, especially from yourself.",
  "Showing up for yourself is a win.",
  "You are allowed to grow at your own pace.",
  "Your effort matters, even on difficult days.",
  "You can begin again whenever you need to.",
  "You are worthy of rest and care.",
  "One quest at a time is enough.",
  "You bring something special to this world.",
  "Your progress does not have to be perfect.",
  "You are stronger than you think.",
] as const;

export function DailyAffirmation({ today }: { today: string }) {
  const seed = Array.from(today).reduce(
    (hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0,
    2166136261,
  );
  return (
    <div className="intro-tag">
      <Sparkles aria-hidden="true" size={14} /> DAILY AFFIRMATION
      <small>{affirmations[seed % affirmations.length]}</small>
    </div>
  );
}
