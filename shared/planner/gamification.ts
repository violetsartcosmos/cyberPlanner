export const achievementCategories = [
  "Daily & Routine", "Skill & Mastery", "Career & Boss Battles",
  "Health & Mind", "Exploration & Secrets",
] as const;
export const tiers = ["Common", "Rare", "Epic", "Legendary"] as const;
export const questKinds = ["side", "main", "boss"] as const;

export type Achievement = {
  id: string;
  title: string;
  description: string;
  category: string;
  tier: string;
  xp: number;
  awardedXp: number;
  target: number;
  current: number;
  icon: string;
  tracking: string;
  taskId: string | null;
  reward: string;
  unlockedAt: string | null;
};

export type Quest = {
  id: string;
  title: string;
  description: string;
  kind: string;
  tier: string;
  points: number;
  completedAt: string | null;
};
