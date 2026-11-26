import type { Achievement, Quest } from "./gamification";
import type { RoutineGroup, RoutineTask } from "./routines";

/** HTTP status and notification returned by quest form actions. */
export type QuestActionResult = {
  status: number;
  message?: string;
  error?: string;
};

/** HTTP feedback and milestone awards returned by completion and routine actions. */
export type RoutineActionResult = {
  status: number;
  message?: string;
  error?: string;
  earnedAchievements?: string[];
};

/** HTTP feedback and immediate milestone awards from achievement creation. */
export type AchievementActionResult = {
  status: number;
  message?: string;
  error?: string;
  earnedAchievements?: string[];
};

export type PlannerActionResult = {
  ok: boolean;
  message?: string;
  error?: string;
  earnedAchievements?: string[];
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

export type GoogleCalendar = {
  id: string;
  name: string;
  writable: boolean;
};

export type CalendarEvent = {
  id: string;
  calendarId: string;
  calendarName: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  editable: boolean;
  etag: string;
  recurring: boolean;
  startTimeZone: string | null;
  endTimeZone: string | null;
};

export type CalendarData = {
  calendars: GoogleCalendar[];
  events: CalendarEvent[];
  unavailableCalendars: string[];
};

export type TherapyPlan = {
  therapySessions: Array<{
    id: string;
    label: string;
    title: string;
    exercises: Array<{
      id: string;
      name: string;
      prescription: string;
      instructions: string;
      purpose: string;
      points: number;
      completed: boolean;
    }>;
  }>;
  earnedPoints: number;
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
      balance: number;
      todayPoints: number;
      earnedTaskKeys: string[];
      totalXp: number;
      newlyEarned: string[];
      achievements: Achievement[];
      quests: Quest[];
      routines: RoutineTask[];
      routineGroups: RoutineGroup[];
      redemptions: Array<{
        rewardId: string;
        rewardName: string;
        amount: number;
        createdAt: string;
      }>;
    };
