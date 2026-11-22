import type { Achievement, Quest } from "./gamification";

export type PlannerActionResult = {
  ok: boolean;
  message?: string;
  error?: string;
  unlockedAchievements?: string[];
  emails?: Array<{
    id: string;
    subject: string;
    from: string;
    snippet: string;
  }>;
};

export type ExternalTask = {
  source: "google" | "gmail";
  externalId: string;
  taskListId: string | null;
  title: string;
  dueDate: string | null;
  completed: boolean;
  completedAt?: string | null;
  emailFrom: string | null;
  emailUrl: string | null;
  isDeleted?: boolean;
};

export type PlannerPage =
  | {
      authenticated: false;
      missingConfiguration: readonly string[];
      authError: string;
    }
  | {
      authenticated: true;
      email: string;
      today: string;
      selected: string;
      checks: Record<string, string[]>;
      tasks: ExternalTask[];
      note: string;
      journal: string;
      journalDates: string[];
      balance: number;
      todayPoints: number;
      earnedTaskKeys: string[];
      totalXp: number;
      newlyUnlocked: string[];
      achievements: Achievement[];
      quests: Quest[];
      redemptions: Array<{
        rewardId: string;
        rewardName: string;
        amount: number;
        createdAt: string;
      }>;
    };
