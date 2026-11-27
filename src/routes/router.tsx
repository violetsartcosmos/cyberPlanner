import { createBrowserRouter, Link, useRouteError } from "react-router";
import { sessionLoader } from "../features/planner/services/session-route";
import { plannerCalendarLoader } from "../features/planner/services/planner-calendar-route";
import { questLogLoader } from "../features/planner/services/quest-log-route";
import {
  acceptQuestTemplateAction, completeQuestAction, createQuestAction, questBoardLoader, questResourceAction,
} from "../features/planner/services/quest-actions";
import {
  createAchievementAction, redeemRewardAction, rewardsLoader,
} from "../features/planner/services/gamification-actions";
import {
  externalCompletionAction, routineCompletionAction, updateRoutineAction,
} from "../features/planner/services/routine-actions";
import {
  therapyCompletionAction, therapyLoader,
} from "../features/therapy/services/therapy-route";
import {
  createJournalAction, journalLoader, journalMarkersLoader, journalResourceAction,
} from "../features/planner/services/journal-actions";
import { profileLoader } from "../features/planner/services/profile-route";
import {
  calendarLoader, createCalendarEventAction, gmailMessagesLoader, importGmailAction,
  syncGoogleTasksAction, updateCalendarEventAction,
} from "../features/calendar/services/google-actions";
import {
  bookDetailsLoader, bookmarksLoader, booksLoader, chaptersLoader, createBookmarkAction,
  deleteBookmarkAction, renameBookAction, saveBookDetailsAction,
} from "../features/books/services/book-actions";
import PlannerLayout from "../layouts/planner-layout";
import PlannerCalendarLayout from "../features/planner/components/planner-calendar-layout";
import BooksPage from "../pages/books";
import CalendarPage from "../pages/calendar";
import DashboardPage from "../pages/dashboard";
import JournalPage from "../pages/journal";
import ProfilePage from "../pages/profile";
import QuestBoardPage from "../pages/quest-board";
import QuestLogPage from "../pages/quest-log";
import RewardsPage from "../pages/rewards";
import { useNotification } from "../components/notifications";
import PhysicalTherapyPlan from "@/pages/PhysicalTherapyPlan";

function RouteError({ root = false }: { root?: boolean }) {
  const error = useRouteError();
  useNotification(error instanceof Error ? error.message : "Could not load the planner.");
  return (
    <main className="app-shell sign-in-shell">
      {!root && <Link className="btn btn-outline-primary" to="/">Return to dashboard</Link>}
      <button className="btn btn-outline-primary" type="button" onClick={() => window.location.reload()}>Reload planner</button>
    </main>
  );
}

function RootError() {
  return <RouteError root />;
}

function PageError() {
  return <RouteError />;
}

function HydrateFallback() {
  return <main className="app-shell sign-in-shell">Loading planner...</main>;
}

/** Composes planner pages and feature-owned resource loaders/actions. */
export const router = createBrowserRouter([{
  id: "planner",
  path: "/",
  Component: PlannerLayout,
  loader: sessionLoader,
  HydrateFallback,
  ErrorBoundary: RootError,
  children: [
    {
      id: "planner-calendar",
      Component: PlannerCalendarLayout,
      loader: plannerCalendarLoader,
      ErrorBoundary: PageError,
      children: [
        { index: true, Component: DashboardPage, loader: journalMarkersLoader, ErrorBoundary: PageError },
        { path: "calendar", Component: CalendarPage, loader: journalMarkersLoader, ErrorBoundary: PageError },
        { path: "quests", Component: CalendarPage, loader: journalMarkersLoader, ErrorBoundary: PageError },
      ],
    },
    { path: "calendar/events", loader: calendarLoader, shouldRevalidate: () => false, ErrorBoundary: PageError },
    { path: "calendar/:calendarId/events", action: createCalendarEventAction, ErrorBoundary: PageError },
    { path: "calendar/:calendarId/events/:id", action: updateCalendarEventAction, ErrorBoundary: PageError },
    { path: "google/tasks/sync/:date", action: syncGoogleTasksAction, ErrorBoundary: PageError },
    { path: "google/gmail/messages", loader: gmailMessagesLoader, ErrorBoundary: PageError },
    { path: "google/gmail/messages/:id/tasks/:date", action: importGmailAction, ErrorBoundary: PageError },
    { path: "quest-board", Component: QuestBoardPage, loader: questBoardLoader, action: createQuestAction, ErrorBoundary: PageError },
    { path: "quest-board/:id", action: questResourceAction, ErrorBoundary: PageError },
    { path: "quest-board/:id/complete", action: completeQuestAction, ErrorBoundary: PageError },
    { path: "quest-log", Component: QuestLogPage, loader: questLogLoader, ErrorBoundary: PageError },
    { path: "quest-log/templates/:templateId/accept", action: acceptQuestTemplateAction, ErrorBoundary: PageError },
    { path: "routines/:id", action: updateRoutineAction, ErrorBoundary: PageError },
    { path: "routines/:id/completions/:date", action: routineCompletionAction, ErrorBoundary: PageError },
    { path: "therapy/sessions/:sessionId/exercises/:exerciseId/completions/:date", action: therapyCompletionAction, ErrorBoundary: PageError },
    { path: "external-tasks/:source/:id/completions/:date", action: externalCompletionAction, ErrorBoundary: PageError },
    { path: "journal", Component: JournalPage, loader: journalLoader, ErrorBoundary: PageError },
    { path: "journal/entries", action: createJournalAction, ErrorBoundary: PageError },
    { path: "journal/entries/:date", action: journalResourceAction, ErrorBoundary: PageError },
    { path: "books", Component: BooksPage, ErrorBoundary: PageError },
    // Metadata mutations update local state; avoid rereading old paths during a rename.
    { path: "books/collection", loader: booksLoader, shouldRevalidate: () => false, ErrorBoundary: PageError },
    { path: "books/:library/:path/details", loader: bookDetailsLoader, action: saveBookDetailsAction, shouldRevalidate: () => false, ErrorBoundary: PageError },
    { path: "books/:library/:path/rename", action: renameBookAction, ErrorBoundary: PageError },
    { path: "books/:library/:path/bookmarks", loader: bookmarksLoader, action: createBookmarkAction, ErrorBoundary: PageError },
    { path: "books/:library/:path/bookmarks/:id", action: deleteBookmarkAction, ErrorBoundary: PageError },
    { path: "books/:library/:path/chapters", loader: chaptersLoader, ErrorBoundary: PageError },
    { path: "rewards", Component: RewardsPage, loader: rewardsLoader, ErrorBoundary: PageError },
    { path: "rewards/:id/redemptions", action: redeemRewardAction, ErrorBoundary: PageError },
    { path: "profile", Component: ProfilePage, loader: profileLoader, ErrorBoundary: PageError },
    { path: "profile/achievements", action: createAchievementAction, ErrorBoundary: PageError },
    { path: "physical-therapy", Component: PhysicalTherapyPlan, loader: therapyLoader, ErrorBoundary: PageError },
  ],
}]);
